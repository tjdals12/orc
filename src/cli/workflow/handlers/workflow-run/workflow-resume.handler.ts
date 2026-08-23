import fs from 'node:fs';

import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { ProjectRepository, type Project } from '#project/repository.js';
import {
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowRunHookLog,
  type WorkflowRunNode,
  type WorkflowRunNodeLog,
} from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';
import type { WorkflowExecutionResult } from '#workflow-run/executor/types.js';
import {
  ExecutionEnvironmentRepository,
  type ExecutionEnvironment,
} from '#execution-environment/repository.js';

import type { WorkflowRunLauncher } from './workflow-run-launcher.js';
import { WorkflowRunLoader } from './workflow-run-loader.js';
import type { WorktreeEnvironmentInfo } from './worktree-environment-provisioner.js';

export type WorkflowResumePlan = {
  projectName: string;
  workflowId: string;
  workflowRunId: string;
  remainingNodeCount: number;
  totalNodeCount: number;
  artifactsDirPath: string | null;
  worktree: WorktreeEnvironmentInfo | null;
  nodeLabels: string[];
};

export type WorkflowResumeProgress = {
  onEvent: (event: WorkflowRunEvent) => void;
  onLog: (log: WorkflowRunNodeLog) => void;
  onHookLog: (hookLog: WorkflowRunHookLog) => void;
};

type WorkflowResumeOutcome =
  | { kind: 'noop' }
  | { kind: 'detached'; workerPid: number }
  | { kind: 'executed'; execution: WorkflowExecutionResult };

export type WorkflowResumeResult = {
  run: WorkflowRun;
  nodes: WorkflowRunNode[];
  outcome: WorkflowResumeOutcome;
};

export class WorkflowResumeHandler {
  private readonly _database: Kysely<Database>;
  private readonly _projectRepository: ProjectRepository;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _loader: WorkflowRunLoader;
  private readonly _launcher: WorkflowRunLauncher;
  private readonly _beginResume: (plan: WorkflowResumePlan) => WorkflowResumeProgress;

  constructor(
    database: Kysely<Database>,
    launcher: WorkflowRunLauncher,
    beginResume: (plan: WorkflowResumePlan) => WorkflowResumeProgress,
  ) {
    this._database = database;
    this._projectRepository = new ProjectRepository(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._loader = new WorkflowRunLoader(database);
    this._launcher = launcher;
    this._beginResume = beginResume;
  }

  async execute(args: { workflowRunId: string; detach: boolean }): Promise<WorkflowResumeResult> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }

    if (workflowRun.status === 'succeeded') {
      const noop = await this.buildResult(workflowRun.id, { kind: 'noop' });
      return noop;
    }
    this.assertResumable(workflowRun);

    const executionEnvironment = await this.findExecutionEnvironmentOrThrow(workflowRun);

    const project = await this.findProjectOrThrow(workflowRun);

    const { workflow, mergedConfig, artifactsDirPath } = this._loader.loadSpec(workflowRun);

    const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );
    const remainingNodes = workflowRunNodes.filter((node) => node.status !== 'succeeded');

    const workflowDeclaresArtifacts = workflow.declaresArtifacts();
    const worktree =
      executionEnvironment.kind === 'worktree' && executionEnvironment.branch !== null
        ? { branch: executionEnvironment.branch, worktreePath: executionEnvironment.path }
        : null;

    const progress = this._beginResume({
      projectName: project.name,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      remainingNodeCount: remainingNodes.length,
      totalNodeCount: workflowRunNodes.length,
      artifactsDirPath: workflowDeclaresArtifacts ? artifactsDirPath : null,
      worktree,
      nodeLabels: workflow.listNodeIds(),
    });

    await this.resetRun(workflowRun, workflowRunNodes);

    const workflowRunRecorder = await this._loader.buildRecorder(workflowRun.id, progress);
    await workflowRunRecorder.recordEvent({ type: 'run_resumed' });

    if (args.detach) {
      const workerPid = this._launcher.spawnWorker(workflowRun.id);
      const detached = await this.buildResult(workflowRun.id, { kind: 'detached', workerPid });
      return detached;
    }

    const resetWorkflowRun: WorkflowRun = {
      ...workflowRun,
      status: 'pending',
      finished_at: null,
    };
    const resetWorkflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
      workflowRun.id,
    );

    const execution = await this._launcher.attach(
      {
        cwd: executionEnvironment.path,
        artifactsDirPath,
        workflow,
        workflowRun: resetWorkflowRun,
        workflowRunNodes: resetWorkflowRunNodes,
        maxConcurrentNodes: mergedConfig.run.maxConcurrentNodes,
      },
      workflowRunRecorder,
    );

    const executed = await this.buildResult(workflowRun.id, { kind: 'executed', execution });
    return executed;
  }

  toJson(result: WorkflowResumeResult) {
    const document = { run: result.run, nodes: result.nodes };
    return document;
  }

  hasFailed(result: WorkflowResumeResult): boolean {
    switch (result.outcome.kind) {
      case 'noop':
      case 'detached':
        return false;
      case 'executed':
        return (
          result.outcome.execution.outcome === 'failed' ||
          result.outcome.execution.outcome === 'cancelled'
        );
    }
  }

  private assertResumable(workflowRun: WorkflowRun): void {
    if (workflowRun.status === 'cancelled') {
      throw new WorkflowRunError(
        `Workflow run ${workflowRun.id} was cancelled. Start a new run instead.`,
      );
    }
    if (workflowRun.status === 'pending') {
      throw new WorkflowRunError(
        `Workflow run ${workflowRun.id} has not started. It may still be provisioning — check "orc workflow status ${workflowRun.id}".`,
      );
    }
    if (workflowRun.status === 'running') {
      const liveness = resolveWorkflowRunLiveness(workflowRun);
      if (liveness === 'alive') {
        throw new WorkflowRunError(
          `Workflow run ${workflowRun.id} is still running. Run "orc workflow cancel ${workflowRun.id}" to stop it, or wait for it to finish.`,
        );
      }
    }
    if (workflowRun.started_at === null) {
      throw new WorkflowRunError(
        `Workflow run ${workflowRun.id} failed during provisioning. Start a new run instead.`,
      );
    }
  }

  private async findExecutionEnvironmentOrThrow(
    workflowRun: WorkflowRun,
  ): Promise<ExecutionEnvironment> {
    const executionEnvironmentId = workflowRun.execution_environment_id;
    if (executionEnvironmentId === null) {
      throw new WorkflowRunError(`Workflow run ${workflowRun.id} has no execution environment.`);
    }

    const executionEnvironment =
      await this._executionEnvironmentRepository.findById(executionEnvironmentId);
    if (!executionEnvironment) {
      throw new WorkflowRunError(`No execution environment with id ${executionEnvironmentId}.`);
    }

    if (!fs.existsSync(executionEnvironment.path)) {
      throw new WorkflowRunError(
        `The execution environment for workflow run ${workflowRun.id} is gone: ${executionEnvironment.path}. Start a new run instead.`,
      );
    }

    return executionEnvironment;
  }

  private async findProjectOrThrow(workflowRun: WorkflowRun): Promise<Project> {
    const project = await this._projectRepository.findById(workflowRun.project_id);
    if (!project) {
      throw new WorkflowRunError(`No project with id ${workflowRun.project_id}.`);
    }
    return project;
  }

  private async resetRun(
    workflowRun: WorkflowRun,
    workflowRunNodes: WorkflowRunNode[],
  ): Promise<void> {
    await this._database.transaction().execute(async (transaction) => {
      const reset = await this._workflowRunRepository.update(
        { id: workflowRun.id, status: workflowRun.status },
        { status: 'pending', finished_at: null },
        { transaction },
      );
      if (!reset) {
        throw new WorkflowRunError(
          `Workflow run ${workflowRun.id} changed state. Check "orc workflow status ${workflowRun.id}" and try again.`,
        );
      }

      for (const workflowRunNode of workflowRunNodes) {
        if (
          workflowRunNode.status === 'pending' ||
          workflowRunNode.status === 'succeeded' ||
          workflowRunNode.status === 'awaiting_decision' ||
          workflowRunNode.status === 'rejected'
        ) {
          continue;
        }
        await this._workflowRunNodeRepository.updateOrThrow(
          { id: workflowRunNode.id, workflowRunId: workflowRun.id },
          {
            status: 'pending',
            attempt: workflowRunNode.attempt + 1,
            reason: null,
            started_at: null,
            finished_at: null,
          },
          { transaction },
        );
      }
    });
  }

  private async buildResult(
    workflowRunId: string,
    outcome: WorkflowResumeOutcome,
  ): Promise<WorkflowResumeResult> {
    const run = await this._workflowRunRepository.findById(workflowRunId);
    if (run === null) {
      throw new Error(`Workflow run ${workflowRunId} disappeared while this command held it.`);
    }

    const nodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(workflowRunId);

    const result: WorkflowResumeResult = { run, nodes, outcome };
    return result;
  }
}
