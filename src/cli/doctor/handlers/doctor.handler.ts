import fs from 'node:fs';

import {
  buildConfigPath,
  buildDatabasePath,
  buildProjectPaths,
  buildProjectSkillDirPaths,
  buildSetupStampPath,
  buildSkillFilePath,
  buildSkillSourceDirPath,
} from '#shared/path.js';
import type { ProgressReporter } from '#cli/progress-reporter.js';
import { loadConfig } from '#installation/config/load.js';
import { InvalidConfigError } from '#installation/config/error.js';
import { tryLoadSetupStamp } from '#installation/setup-stamp/load.js';
import { SETUP_VERSION } from '#installation/setup-stamp/schema.js';
import {
  checkProviderDoctorStatuses,
  type ProviderDoctorStatus,
} from '#installation/provider/auth.js';
import { openDatabase } from '#database/open.js';
import { ProjectRepository } from '#project/repository.js';
import { loadProjectConfig } from '#project/config/load.js';
import { InvalidProjectConfigError } from '#project/config/error.js';
import type { ProjectConfigFile } from '#project/config/schema.js';
import { countHookFiles } from '#project/config/hooks.js';
import { hasHeadCommit } from '#shared/git.js';
import { checkSkillStatus, type SkillStatus } from '#project/skill.js';
import { countWorkflowFiles } from '#workflow/load.js';

export type ConfigCheck = { status: 'valid' } | { status: 'invalid'; reason: string };

export type ProjectConfigCheck =
  { status: 'valid'; projectConfig: ProjectConfigFile } | { status: 'invalid'; reason: string };

export type RegistrationStatus =
  | { status: 'registered'; name: string }
  | { status: 'not-registered' }
  | { status: 'incomplete'; name: string };

export type SetupStatus = 'complete' | 'not-set-up' | 'incomplete' | 'newer-than-tool';

export type DoctorResult = {
  installation: {
    configPath: string;
    configCheck: ConfigCheck | null;
    setupStatus: SetupStatus;
    providerStatuses: ProviderDoctorStatus[];
  };
  project: {
    path: string;
    configPath: string;
    configCheck: ProjectConfigCheck | null;
    registrationStatus: RegistrationStatus;
    gitReady: boolean;
    workflowCount: number;
    hookCount: number | null;
    skill: SkillStatus;
  };
};

export class DoctorHandler {
  constructor(private readonly _reporter: ProgressReporter) {}

  async execute(projectPath: string): Promise<DoctorResult> {
    const setupStampPath = buildSetupStampPath();
    const configPath = buildConfigPath();
    const databasePath = buildDatabasePath();
    const { projectConfigPath, workflowsDirPath } = buildProjectPaths(projectPath);
    const skillSourceDirPath = buildSkillSourceDirPath();
    const sourceSkillFilePath = buildSkillFilePath(skillSourceDirPath);
    const { claudeSkillDirPath, agentsSkillDirPath } = buildProjectSkillDirPaths(projectPath);
    const installedSkillFilePaths = [claudeSkillDirPath, agentsSkillDirPath].map((skillDirPath) =>
      buildSkillFilePath(skillDirPath),
    );

    const configCheck = this.checkConfig(configPath);

    const setupStatus = this.checkSetupStatus(setupStampPath, configPath, databasePath);

    this._reporter.start('Checking providers...');
    let providerStatuses: ProviderDoctorStatus[];
    try {
      providerStatuses = await checkProviderDoctorStatuses();
    } finally {
      this._reporter.stop();
    }

    const projectRegistrationStatus = await this.checkRegistrationStatus(
      databasePath,
      projectPath,
      projectConfigPath,
    );

    const projectConfigCheck = this.checkProjectConfig(projectConfigPath);

    const projectGitReady = await hasHeadCommit(projectPath);

    const projectWorkflowCount = countWorkflowFiles(workflowsDirPath);

    const projectHookCount =
      projectConfigCheck?.status === 'valid'
        ? countHookFiles(projectConfigCheck.projectConfig.worktree ?? null)
        : null;

    const projectSkillStatus = checkSkillStatus({ sourceSkillFilePath, installedSkillFilePaths });

    const result: DoctorResult = {
      installation: {
        setupStatus,
        configCheck,
        configPath,
        providerStatuses,
      },
      project: {
        path: projectPath,
        registrationStatus: projectRegistrationStatus,
        configCheck: projectConfigCheck,
        configPath: projectConfigPath,
        gitReady: projectGitReady,
        workflowCount: projectWorkflowCount,
        hookCount: projectHookCount,
        skill: projectSkillStatus,
      },
    };
    return result;
  }

  private checkConfig(configPath: string): ConfigCheck | null {
    try {
      const config = loadConfig(configPath);
      if (config === null) {
        return null;
      }
      const check: ConfigCheck = { status: 'valid' };
      return check;
    } catch (e) {
      if (e instanceof InvalidConfigError) {
        const check: ConfigCheck = { status: 'invalid', reason: e.reason };
        return check;
      }
      throw e;
    }
  }

  private checkProjectConfig(projectConfigPath: string): ProjectConfigCheck | null {
    try {
      const projectConfig = loadProjectConfig(projectConfigPath);
      if (projectConfig === null) {
        return null;
      }
      const check: ProjectConfigCheck = { status: 'valid', projectConfig };
      return check;
    } catch (e) {
      if (e instanceof InvalidProjectConfigError) {
        const check: ProjectConfigCheck = { status: 'invalid', reason: e.reason };
        return check;
      }
      throw e;
    }
  }

  private async checkRegistrationStatus(
    databasePath: string,
    projectPath: string,
    projectConfigPath: string,
  ): Promise<RegistrationStatus> {
    const databaseExists = fs.existsSync(databasePath);
    if (!databaseExists) {
      const notRegistered: RegistrationStatus = { status: 'not-registered' };
      return notRegistered;
    }

    const database = openDatabase(databasePath);
    try {
      const projectRepository = new ProjectRepository(database);
      const project = await projectRepository.findByPath(projectPath);
      if (project === null) {
        const notRegistered: RegistrationStatus = { status: 'not-registered' };
        return notRegistered;
      }

      const projectConfigExists = fs.existsSync(projectConfigPath);
      if (!projectConfigExists) {
        const incomplete: RegistrationStatus = { status: 'incomplete', name: project.name };
        return incomplete;
      }

      const registered: RegistrationStatus = { status: 'registered', name: project.name };
      return registered;
    } finally {
      await database.destroy();
    }
  }

  private checkSetupStatus(
    setupStampPath: string,
    configPath: string,
    databasePath: string,
  ): SetupStatus {
    const stampExists = fs.existsSync(setupStampPath);
    const configExists = fs.existsSync(configPath);
    const databaseExists = fs.existsSync(databasePath);

    if (!stampExists && !configExists && !databaseExists) {
      return 'not-set-up';
    }

    const setupStamp = tryLoadSetupStamp(setupStampPath);
    if (setupStamp !== null && setupStamp.setupVersion > SETUP_VERSION) {
      return 'newer-than-tool';
    }

    const stampIsCurrent = setupStamp !== null && setupStamp.setupVersion === SETUP_VERSION;
    if (stampIsCurrent && configExists && databaseExists) {
      return 'complete';
    }

    return 'incomplete';
  }

  toJson(result: DoctorResult) {
    const { installation, project } = result;

    const providers = installation.providerStatuses.map((provider) =>
      provider.authStatus.status === 'signed-in'
        ? {
            id: provider.id,
            status: provider.authStatus.status,
            method: provider.authStatus.method,
            cli: provider.cliStatus,
          }
        : { id: provider.id, status: provider.authStatus.status, cli: provider.cliStatus },
    );

    const installationConfig =
      installation.configCheck === null
        ? null
        : installation.configCheck.status === 'valid'
          ? { status: 'valid' }
          : {
              status: 'invalid',
              reason: installation.configCheck.reason,
              path: installation.configPath,
            };

    const registered =
      project.registrationStatus.status === 'not-registered'
        ? { status: 'not-registered' }
        : { status: project.registrationStatus.status, name: project.registrationStatus.name };

    const projectConfig =
      project.configCheck === null
        ? null
        : project.configCheck.status === 'valid'
          ? { status: 'valid' }
          : { status: 'invalid', reason: project.configCheck.reason, path: project.configPath };

    const doctorJson = {
      installation: {
        setup: { status: installation.setupStatus },
        config: installationConfig,
        providers,
      },
      project: {
        path: project.path,
        registered,
        config: projectConfig,
        git: { status: project.gitReady ? 'ready' : 'not-ready' },
        workflows: { count: project.workflowCount },
        hooks: project.hookCount === null ? null : { count: project.hookCount },
        skill: project.skill,
      },
    };
    return doctorJson;
  }
}
