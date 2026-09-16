import type { Kysely } from 'kysely';

import { buildSpecPaths, buildWorkflowRunPaths } from '#shared/path.js';

import type { Database } from '#database/schema.js';
import { loadMergedConfigOrThrow } from '#project/merged-config/load.js';
import type { MergedConfig } from '#project/merged-config/merged-config.js';
import type { Workflow } from '#workflow/workflow.js';
import { loadWorkflowOrThrow } from '#workflow/load.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunHookLogRepository,
  WorkflowRunNodeLogRepository,
  type WorkflowRun,
  type WorkflowRunEvent,
  type WorkflowRunHookLog,
  type WorkflowRunNodeLog,
} from '#workflow-run/repository.js';
import { WorkflowRunRecorder } from '#workflow-run/recorder.js';
import { WorkflowRunSequenceReader } from '#workflow-run/sequence.js';

type WorkflowRunSpec = {
  workflow: Workflow;
  mergedConfig: MergedConfig;
  artifactsDirPath: string;
};

type WorkflowRunListeners = {
  onEvent: (event: WorkflowRunEvent) => void;
  onLog: (log: WorkflowRunNodeLog) => void;
  onHookLog: (hookLog: WorkflowRunHookLog) => void;
};

export class WorkflowRunLoader {
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;
  private readonly _workflowRunNodeLogRepository: WorkflowRunNodeLogRepository;
  private readonly _workflowRunHookLogRepository: WorkflowRunHookLogRepository;
  private readonly _workflowRunSequenceReader: WorkflowRunSequenceReader;

  constructor(database: Kysely<Database>) {
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
    this._workflowRunNodeLogRepository = new WorkflowRunNodeLogRepository(database);
    this._workflowRunHookLogRepository = new WorkflowRunHookLogRepository(database);
    this._workflowRunSequenceReader = new WorkflowRunSequenceReader(database);
  }

  loadSpec(workflowRun: WorkflowRun): WorkflowRunSpec {
    const { specDirPath, artifactsDirPath } = buildWorkflowRunPaths({
      projectId: workflowRun.project_id,
      workflowRunId: workflowRun.id,
    });

    const { specConfigPath, specHooksDirPath, specWorkflowPath } = buildSpecPaths(
      specDirPath,
      workflowRun.workflow_id,
    );

    const workflow = loadWorkflowOrThrow(specWorkflowPath);
    const mergedConfig = loadMergedConfigOrThrow(specConfigPath, specHooksDirPath);

    const spec: WorkflowRunSpec = { workflow, mergedConfig, artifactsDirPath };
    return spec;
  }

  async buildRecorder(
    workflowRunId: string,
    listeners: WorkflowRunListeners,
  ): Promise<WorkflowRunRecorder> {
    const lastSequence = await this._workflowRunSequenceReader.findLastSequence(workflowRunId);
    const initialSequence = lastSequence === null ? 0 : lastSequence + 1;

    const workflowRunRecorder = new WorkflowRunRecorder({
      initialSequence,
      saveEvent: (input) => this._workflowRunEventRepository.create({ workflowRunId, ...input }),
      onEvent: listeners.onEvent,
      saveLog: (input) => this._workflowRunNodeLogRepository.create({ workflowRunId, ...input }),
      onLog: listeners.onLog,
      saveHookLog: (input) =>
        this._workflowRunHookLogRepository.create({ workflowRunId, ...input }),
      onHookLog: listeners.onHookLog,
    });
    return workflowRunRecorder;
  }
}
