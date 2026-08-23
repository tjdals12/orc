import fs from 'node:fs';
import util from 'node:util';

import type { Kysely } from 'kysely';
import { stringify as stringifyYaml } from 'yaml';

import {
  buildConfigPath,
  buildProjectConfigPath,
  buildProjectHooksDirPath,
  buildSpecPaths,
  buildWorkflowPath,
  buildWorkflowsDirPath,
} from '#shared/path.js';

import type { Database } from '#database/schema.js';
import { loadConfigOrThrow } from '#installation/config/load.js';
import { loadProjectConfigOrThrow } from '#project/config/load.js';
import { MergedConfig } from '#project/merged-config/merged-config.js';
import { ProjectRepository, type Project } from '#project/repository.js';
import { ProjectError } from '#project/error.js';
import { loadWorkflowOrThrow } from '#workflow/load.js';
import type { Workflow } from '#workflow/workflow.js';
import { WorkflowRunError } from '#workflow-run/error.js';
import {
  WorkflowRunEventRepository,
  WorkflowRunHookLogRepository,
  WorkflowRunNodeLogRepository,
  WorkflowRunNodeRepository,
  WorkflowRunRepository,
  type WorkflowRun,
  type WorkflowRunNode,
} from '#workflow-run/repository.js';
import { WorkflowRunRecorder } from '#workflow-run/recorder.js';

import { WorkflowRunInputReader } from './workflow-run-input-reader.js';
import { WorkflowRunStateWriter } from './workflow-run-state-writer.js';
import type {
  WorkflowRunInput,
  WorkflowRunOutcome,
  WorkflowRunProgress,
  WorkflowRunResult,
} from './types.js';

export abstract class WorkflowRunHandler {
  private readonly _database: Kysely<Database>;
  private readonly _projectRepository: ProjectRepository;
  private readonly _workflowRunRepository: WorkflowRunRepository;
  private readonly _workflowRunNodeRepository: WorkflowRunNodeRepository;
  private readonly _workflowRunEventRepository: WorkflowRunEventRepository;
  private readonly _workflowRunNodeLogRepository: WorkflowRunNodeLogRepository;
  private readonly _workflowRunHookLogRepository: WorkflowRunHookLogRepository;
  private readonly _workflowRunInputReader: WorkflowRunInputReader;
  protected readonly workflowRunStateWriter: WorkflowRunStateWriter;

  constructor(database: Kysely<Database>) {
    this._database = database;
    this._projectRepository = new ProjectRepository(database);
    this._workflowRunRepository = new WorkflowRunRepository(database);
    this._workflowRunNodeRepository = new WorkflowRunNodeRepository(database);
    this._workflowRunEventRepository = new WorkflowRunEventRepository(database);
    this._workflowRunNodeLogRepository = new WorkflowRunNodeLogRepository(database);
    this._workflowRunHookLogRepository = new WorkflowRunHookLogRepository(database);
    this._workflowRunInputReader = new WorkflowRunInputReader();
    this.workflowRunStateWriter = new WorkflowRunStateWriter(database);
  }

  abstract execute(
    projectPath: string,
    args: {
      input: WorkflowRunInput | null;
      workflowId: string;
      detach: boolean;
    },
  ): Promise<WorkflowRunResult>;

  toJson(result: WorkflowRunResult) {
    const document = { run: result.run, nodes: result.nodes };
    return document;
  }

  hasFailed(result: WorkflowRunResult): boolean {
    switch (result.outcome.kind) {
      case 'detached':
        return false;
      case 'provisioning-failed':
      case 'cancelled':
        return true;
      case 'executed':
        return (
          result.outcome.execution.outcome === 'failed' ||
          result.outcome.execution.outcome === 'cancelled'
        );
    }
  }

  protected readInput(inputSource: WorkflowRunInput | null): string | null {
    const input = this._workflowRunInputReader.read(inputSource);
    return input;
  }

  protected resolveWorkflow(projectPath: string, workflowId: string): Workflow {
    const workflowsDirPath = buildWorkflowsDirPath(projectPath);
    const workflowPath = buildWorkflowPath(workflowsDirPath, workflowId);
    const workflow = loadWorkflowOrThrow(workflowPath);
    return workflow;
  }

  protected resolveConfig(projectPath: string): MergedConfig {
    const globalConfigPath = buildConfigPath();
    const globalConfig = loadConfigOrThrow(globalConfigPath);

    const projectConfigPath = buildProjectConfigPath(projectPath);
    const projectConfig = loadProjectConfigOrThrow(projectConfigPath);

    const projectHooksDirPath = buildProjectHooksDirPath(projectPath);

    const mergedConfig = MergedConfig.merge(projectHooksDirPath, globalConfig, projectConfig);
    mergedConfig.worktree.assertHookFilesExist();

    return mergedConfig;
  }

  protected async findProjectOrThrow(projectPath: string): Promise<Project> {
    const project = await this._projectRepository.findByPath(projectPath);
    if (project === null) {
      throw new ProjectError(
        `Not a registered project: ${projectPath}. Run "orc project add <name>" first.`,
      );
    }
    return project;
  }

  protected async createRun(args: {
    projectId: string;
    workflow: Workflow;
    input: string | null;
  }): Promise<{ workflowRun: WorkflowRun; workflowRunNodes: WorkflowRunNode[] }> {
    const { projectId, workflow, input } = args;

    const created = await this._database.transaction().execute(async (transaction) => {
      const workflowRun = await this._workflowRunRepository.create(
        {
          projectId,
          workflowId: workflow.id,
          input,
        },
        { transaction },
      );

      const workflowRunNodes = await this._workflowRunNodeRepository.createMany(
        workflow.nodes.map((node, position) => ({
          workflowRunId: workflowRun.id,
          nodeId: node.id,
          position,
        })),
        { transaction },
      );

      return { workflowRun, workflowRunNodes };
    });
    return created;
  }

  protected buildRecorder(
    workflowRunId: string,
    progress: WorkflowRunProgress,
  ): WorkflowRunRecorder {
    const workflowRunRecorder = new WorkflowRunRecorder({
      initialSequence: 0,
      saveEvent: (input) => this._workflowRunEventRepository.create({ workflowRunId, ...input }),
      onEvent: progress.onEvent,
      saveLog: (input) => this._workflowRunNodeLogRepository.create({ workflowRunId, ...input }),
      onLog: progress.onLog,
      saveHookLog: (input) =>
        this._workflowRunHookLogRepository.create({ workflowRunId, ...input }),
      onHookLog: progress.onHookLog,
    });
    return workflowRunRecorder;
  }

  protected createRunDir(args: {
    workflowRunDirPath: string;
    specDirPath: string;
    artifactsDirPath: string;
    workflow: Workflow;
    config: MergedConfig;
  }) {
    const { workflowRunDirPath, specDirPath, artifactsDirPath, workflow, config } = args;

    const { specConfigPath, specHooksDirPath, specWorkflowDirPath, specWorkflowPath } =
      buildSpecPaths(specDirPath, workflow.id);

    try {
      fs.mkdirSync(specDirPath, { recursive: true });
      fs.writeFileSync(specConfigPath, stringifyYaml(config.toFile()));

      fs.mkdirSync(specWorkflowDirPath, { recursive: true });
      fs.copyFileSync(workflow.sourcePath, specWorkflowPath);

      fs.mkdirSync(artifactsDirPath, { recursive: true });

      const teardownHookFiles = config.worktree.listTeardownHookFiles();
      if (teardownHookFiles.length > 0) {
        fs.cpSync(config.worktree.hooksDirPath, specHooksDirPath, { recursive: true });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : util.inspect(e);
      throw new WorkflowRunError(
        `Failed to create the run directory at ${workflowRunDirPath}. ${message}`,
      );
    }
  }

  protected async buildResult(
    workflowRunId: string,
    outcome: WorkflowRunOutcome,
  ): Promise<WorkflowRunResult> {
    const run = await this._workflowRunRepository.findById(workflowRunId);
    if (run === null) {
      throw new Error(`Workflow run ${workflowRunId} disappeared while this command held it.`);
    }

    const nodes = await this._workflowRunNodeRepository.findManyByWorkflowRunId(workflowRunId);

    const result: WorkflowRunResult = { run, nodes, outcome };
    return result;
  }
}
