import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import type { WorkflowExecutionResult } from '#workflow-run/executor/types.js';
import {
  followWorkflowRun,
  type WorkflowRunState,
  type WorkflowRunStreamEntry,
} from '#workflow-run/follow.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';
import { WorkflowRunRepository } from '#workflow-run/repository.js';
import type { WorkflowRunRecorder } from '#workflow-run/recorder.js';
import { WorkflowRunSequenceReader } from '#workflow-run/sequence.js';

import { WorkflowStreamCollector } from '../workflow-stream-collector.js';
import { WorkflowExecutionResultLoader } from './workflow-execution-result-loader.js';
import type { WorkflowRunLauncher, WorkflowWorkerLaunchResult } from './workflow-run-launcher.js';
import type { WorkflowRunProgress, WorkflowRunSignal } from './types.js';

export type WorkflowRunCoordinationOutcome =
  | { kind: 'detached'; workerPid: number }
  | { kind: 'cancelled' }
  | { kind: 'interrupted'; signal: WorkflowRunSignal; exitCode: number }
  | { kind: 'executed'; execution: WorkflowExecutionResult };

export class WorkflowRunCoordinator {
  private readonly _pollIntervalMs = 250;
  private readonly _drainGraceMs = 10_000;

  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowExecutionResultLoader: WorkflowExecutionResultLoader;
  private readonly _workflowStreamCollector: WorkflowStreamCollector;
  private readonly _workflowRunSequenceReader: WorkflowRunSequenceReader;
  private readonly _workflowRunLauncher: WorkflowRunLauncher;

  constructor(database: Kysely<Database>, workflowRunLauncher: WorkflowRunLauncher) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowExecutionResultLoader = new WorkflowExecutionResultLoader(database);
    this._workflowStreamCollector = new WorkflowStreamCollector(database);
    this._workflowRunSequenceReader = new WorkflowRunSequenceReader(database);
    this._workflowRunLauncher = workflowRunLauncher;
  }

  async execute(args: {
    workflowRunId: string;
    workflowRunRecorder: WorkflowRunRecorder;
    progress: WorkflowRunProgress;
    detach: boolean;
  }): Promise<WorkflowRunCoordinationOutcome> {
    const signalWatch = new WorkflowRunSignalWatch();
    signalWatch.start();
    try {
      return await this.coordinate(args, signalWatch);
    } finally {
      signalWatch.stop();
    }
  }

  private async coordinate(
    args: {
      workflowRunId: string;
      workflowRunRecorder: WorkflowRunRecorder;
      progress: WorkflowRunProgress;
      detach: boolean;
    },
    signalWatch: WorkflowRunSignalWatch,
  ): Promise<WorkflowRunCoordinationOutcome> {
    const { workflowRunId, workflowRunRecorder, progress, detach } = args;
    const initialCursor = await this._workflowRunSequenceReader.findLastSequence(workflowRunId);

    let launchResult: WorkflowWorkerLaunchResult;
    try {
      launchResult = await this._workflowRunLauncher.launchWorker({
        workflowRunId,
        workflowRunRecorder,
        signal: signalWatch.signal,
      });
    } catch (e) {
      const workflowRun = await this._workflowRunRepository.findById(workflowRunId);
      if (workflowRun === null || workflowRun.status !== 'failed') {
        throw e;
      }

      const execution = await this._workflowExecutionResultLoader.load(workflowRunId);
      return { kind: 'executed', execution };
    }

    if (launchResult.outcome === 'interrupted') {
      return { kind: 'cancelled' };
    }

    if (detach && launchResult.outcome === 'running') {
      return { kind: 'detached', workerPid: launchResult.workerPid };
    }

    const followProgress: WorkflowRunProgress = detach
      ? { onEvent: () => {}, onLog: () => {}, onHookLog: () => {} }
      : progress;
    const onEntries = (entries: WorkflowRunStreamEntry[]): void => {
      for (const entry of entries) {
        if (entry.kind === 'event') {
          followProgress.onEvent(entry.event);
        } else if (entry.kind === 'log') {
          followProgress.onLog(entry.log);
        } else {
          followProgress.onHookLog(entry.hookLog);
        }
      }
    };
    const followOutcome = await followWorkflowRun(
      (cursor) => this._workflowStreamCollector.collectEntries(workflowRunId, cursor),
      () => this.checkRunState(workflowRunId),
      onEntries,
      {
        pollIntervalMs: this._pollIntervalMs,
        drainGraceMs: this._drainGraceMs,
        initialCursor,
        signal: signalWatch.signal,
      },
    );
    switch (followOutcome) {
      case 'ended': {
        const execution = await this._workflowExecutionResultLoader.load(workflowRunId);
        return { kind: 'executed', execution };
      }
      case 'interrupted': {
        const receivedSignal = signalWatch.receivedSignal;
        if (receivedSignal === null) {
          throw new Error(`Workflow run ${workflowRunId} follow was interrupted without a signal.`);
        }
        return {
          kind: 'interrupted',
          signal: receivedSignal,
          exitCode: signalWatch.resolveExitCode(receivedSignal),
        };
      }
      case 'dead':
        throw new WorkflowRunError(`Workflow run ${workflowRunId} has no live worker.`);
      case 'deleted':
        throw new WorkflowRunError(`No workflow run "${workflowRunId}".`);
    }
  }

  private async checkRunState(workflowRunId: string): Promise<WorkflowRunState> {
    const workflowRun = await this._workflowRunRepository.findById(workflowRunId);
    if (workflowRun === null) {
      return 'deleted';
    }

    const runIsActive =
      workflowRun.status === 'pending' ||
      workflowRun.status === 'running' ||
      workflowRun.status === 'stopping';
    if (!runIsActive) {
      return 'ended';
    }

    const liveness = resolveWorkflowRunLiveness(workflowRun);
    if (liveness === 'dead') {
      return 'dead';
    }
    return 'running';
  }
}

class WorkflowRunSignalWatch {
  private readonly _abortController = new AbortController();
  private _receivedSignal: WorkflowRunSignal | null = null;

  readonly signal = this._abortController.signal;

  start(): void {
    process.on('SIGINT', this.onSigint);
    process.on('SIGTERM', this.onSigterm);
    process.on('SIGHUP', this.onSighup);
  }

  stop(): void {
    process.off('SIGINT', this.onSigint);
    process.off('SIGTERM', this.onSigterm);
    process.off('SIGHUP', this.onSighup);
  }

  get receivedSignal(): WorkflowRunSignal | null {
    return this._receivedSignal;
  }

  resolveExitCode(signal: WorkflowRunSignal): number {
    switch (signal) {
      case 'SIGINT':
        return 130;
      case 'SIGTERM':
        return 143;
      case 'SIGHUP':
        return 129;
    }
  }

  private readonly onSigint = (): void => {
    this.onSignal('SIGINT');
  };

  private readonly onSigterm = (): void => {
    this.onSignal('SIGTERM');
  };

  private readonly onSighup = (): void => {
    this.onSignal('SIGHUP');
  };

  private onSignal(signal: WorkflowRunSignal): void {
    if (this._receivedSignal !== null) {
      process.exit(this.resolveExitCode(signal));
    }
    this._receivedSignal = signal;
    this._abortController.abort();
  }
}
