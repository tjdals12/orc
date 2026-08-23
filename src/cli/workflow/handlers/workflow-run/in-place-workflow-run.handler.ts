import util from 'node:util';

import type { Kysely } from 'kysely';

import { buildWorkflowRunPaths } from '#shared/path.js';

import type { Database } from '#database/schema.js';
import type { ExecutionEnvironment } from '#execution-environment/repository.js';
import { ExecutionEnvironmentError } from '#execution-environment/error.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import { watchInterrupt } from '#cli/interrupt-watch.js';
import { WorkflowRunHandler } from './workflow-run.handler.js';
import type { WorkflowRunLauncher } from './workflow-run-launcher.js';
import type { InPlaceEnvironmentProvisioner } from './in-place-environment-provisioner.js';
import type {
  WorkflowRunInput,
  WorkflowRunPlan,
  WorkflowRunProgress,
  WorkflowRunResult,
} from './types.js';

export class InPlaceWorkflowRunHandler extends WorkflowRunHandler {
  private readonly _inPlaceEnvironmentProvisioner: InPlaceEnvironmentProvisioner;
  private readonly _workflowRunLauncher: WorkflowRunLauncher;
  private readonly _beginRun: (plan: WorkflowRunPlan) => WorkflowRunProgress;

  constructor(
    database: Kysely<Database>,
    inPlaceEnvironmentProvisioner: InPlaceEnvironmentProvisioner,
    workflowRunLauncher: WorkflowRunLauncher,
    beginRun: (plan: WorkflowRunPlan) => WorkflowRunProgress,
  ) {
    super(database);
    this._inPlaceEnvironmentProvisioner = inPlaceEnvironmentProvisioner;
    this._workflowRunLauncher = workflowRunLauncher;
    this._beginRun = beginRun;
  }

  async execute(
    projectPath: string,
    args: {
      input: WorkflowRunInput | null;
      workflowId: string;
      detach: boolean;
    },
  ): Promise<WorkflowRunResult> {
    const input = this.readInput(args.input);

    const workflow = this.resolveWorkflow(projectPath, args.workflowId);

    if (input !== null && !workflow.declaresInput()) {
      throw new WorkflowRunError(
        `This workflow does not take an input. Drop --input, --input-file`,
      );
    }
    if (input === null && workflow.requiresInput()) {
      throw new WorkflowRunError(
        'This workflow requires an input. Pass --input <text> or --input-file <path>.',
      );
    }

    const config = this.resolveConfig(projectPath);

    const project = await this.findProjectOrThrow(projectPath);

    const { workflowRun, workflowRunNodes } = await this.createRun({
      projectId: project.id,
      workflow,
      input,
    });

    const { workflowRunDirPath, specDirPath, artifactsDirPath } = buildWorkflowRunPaths({
      projectId: project.id,
      workflowRunId: workflowRun.id,
    });

    const progress = this._beginRun({
      projectName: project.name,
      workflowId: workflow.id,
      workflowRunId: workflowRun.id,
      workflowRunNodeCount: workflowRunNodes.length,
      artifactsDirPath: workflow.declaresArtifacts() ? artifactsDirPath : null,
      nodeLabels: [...workflow.listNodeIds()],
    });

    const workflowRunRecorder = this.buildRecorder(workflowRun.id, progress);

    let executionEnvironment: ExecutionEnvironment;

    const interruptWatch = watchInterrupt();
    try {
      this.createRunDir({
        workflowRunDirPath,
        specDirPath,
        artifactsDirPath,
        workflow,
        config,
      });

      executionEnvironment = await this._inPlaceEnvironmentProvisioner.provision({
        project,
        workflowRun,
      });
    } catch (e) {
      const interrupted = interruptWatch.wasInterrupted();
      if (interrupted) {
        await this.workflowRunStateWriter.markPendingRunCancelled(workflowRun.id);
        await workflowRunRecorder.recordEvent({ type: 'run_cancelled' });

        const cancelled = await this.buildResult(workflowRun.id, { kind: 'cancelled' });
        return cancelled;
      }

      const reason = e instanceof Error ? e.message : util.inspect(e);

      await this.workflowRunStateWriter.markPendingRunFailed(workflowRun.id);
      await workflowRunRecorder.recordEvent({ type: 'run_failed', reason });

      if (e instanceof ExecutionEnvironmentError) {
        const provisioningFailed = await this.buildResult(workflowRun.id, {
          kind: 'provisioning-failed',
          reason,
        });
        return provisioningFailed;
      }

      throw e;
    } finally {
      interruptWatch.stop();
    }

    if (args.detach) {
      const workerPid = this._workflowRunLauncher.spawnWorker(workflowRun.id);

      const detached = await this.buildResult(workflowRun.id, { kind: 'detached', workerPid });
      return detached;
    }

    const execution = await this._workflowRunLauncher.attach(
      {
        cwd: executionEnvironment.path,
        artifactsDirPath,
        workflow,
        workflowRun,
        workflowRunNodes,
        maxConcurrentNodes: config.run.maxConcurrentNodes,
      },
      workflowRunRecorder,
    );

    const executed = await this.buildResult(workflowRun.id, { kind: 'executed', execution });
    return executed;
  }
}
