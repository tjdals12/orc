import fs from 'node:fs';
import util from 'node:util';

import type { Kysely } from 'kysely';

import type { Database } from '#database/schema.js';
import { ExecutionEnvironmentRepository } from '#execution-environment/repository.js';
import { cleanupStoppedRun } from '#workflow-run/stop-cleanup.js';
import { resolveWorkflowRunLiveness } from '#workflow-run/liveness.js';
import { WorkflowRunNodeRepository, WorkflowRunRepository } from '#workflow-run/repository.js';
import { WorkflowRunError } from '#workflow-run/error.js';

import { WorkflowRunLoader } from './workflow-run-loader.js';
import { WorkflowRunStateWriter } from './workflow-run-state-writer.js';

export class WorkflowStopFinalizerHandler {
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _executionEnvironmentRepository: ExecutionEnvironmentRepository;
  private readonly _workflowRunStateWriter: WorkflowRunStateWriter;
  private readonly _loader: WorkflowRunLoader;

  constructor(database: Kysely<Database>) {
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._executionEnvironmentRepository = new ExecutionEnvironmentRepository(database);
    this._workflowRunStateWriter = new WorkflowRunStateWriter(database);
    this._loader = new WorkflowRunLoader(database);
  }

  async execute(args: { workflowRunId: string }): Promise<void> {
    const workflowRun = await this._workflowRunRepository.findById(args.workflowRunId);
    if (!workflowRun) {
      throw new WorkflowRunError(`No workflow run "${args.workflowRunId}".`);
    }
    if (workflowRun.status !== 'stopping') {
      throw new WorkflowRunError(`Workflow run ${workflowRun.id} is not stopping.`);
    }
    const liveness = resolveWorkflowRunLiveness(workflowRun);
    if (liveness === 'alive') {
      throw new WorkflowRunError(`Workflow run ${workflowRun.id} still has a live worker.`);
    }

    const claimed = await this._workflowRunRepository.update(
      { id: workflowRun.id, status: 'stopping', pid: workflowRun.pid },
      { pid: process.pid },
    );
    if (!claimed) {
      return;
    }

    const workflowRunRecorder = await this._loader.buildRecorder(workflowRun.id, {
      onEvent: () => {},
      onLog: () => {},
      onHookLog: () => {},
    });
    await workflowRunRecorder.recordEvent({ type: 'run_stop_requested' });

    try {
      const { workflow, artifactsDirPath } = this._loader.loadSpec(workflowRun);
      const executionEnvironmentId = workflowRun.execution_environment_id;
      if (executionEnvironmentId === null) {
        throw new Error(`Workflow run ${workflowRun.id} has no execution environment.`);
      }
      const executionEnvironment =
        await this._executionEnvironmentRepository.findById(executionEnvironmentId);
      if (!executionEnvironment || !fs.existsSync(executionEnvironment.path)) {
        throw new Error(`The execution environment for workflow run ${workflowRun.id} is gone.`);
      }

      const workflowRunNodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(
        workflowRun.id,
      );
      const interruptedNodes = workflowRunNodes.filter((node) => node.status === 'running');
      const warning = await cleanupStoppedRun({
        cwd: executionEnvironment.path,
        artifactsDirPath,
        workflowNodes: workflow.nodes,
        interruptedNodeIds: interruptedNodes.map((node) => node.node_id),
      });

      await this._workflowRunStateWriter.markRunStopped(workflowRun.id, interruptedNodes);
      for (const node of interruptedNodes) {
        await workflowRunRecorder.recordEvent({ type: 'node_stopped', nodeId: node.node_id });
      }
      await workflowRunRecorder.recordEvent({ type: 'run_stopped', warning });
    } catch (e) {
      const reason = e instanceof Error ? e.message : util.inspect(e);
      await this._workflowRunStateWriter.markRunStopFailed(workflowRun.id);
      await workflowRunRecorder.recordEvent({ type: 'run_stop_failed', reason });
    }
  }
}
