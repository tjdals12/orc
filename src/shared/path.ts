import { homedir } from 'node:os';
import path from 'node:path';
import url from 'node:url';

export function buildHomeDirPath() {
  const overridden = process.env.ORC_HOME;
  if (overridden) {
    return overridden;
  }

  const dirPath = path.join(homedir(), '.orc');
  return dirPath;
}

export function buildConfigPath() {
  const homeDirPath = buildHomeDirPath();
  const configPath = path.join(homeDirPath, 'config.yml');
  return configPath;
}

export function buildSetupStampPath() {
  const homeDirPath = buildHomeDirPath();
  const setupStampPath = path.join(homeDirPath, 'setup-stamp.json');
  return setupStampPath;
}

export function buildDatabasePath() {
  const homeDirPath = buildHomeDirPath();
  const databasePath = path.join(homeDirPath, 'orc.db');
  return databasePath;
}

export function buildProjectsAreaDirPath() {
  const homeDirPath = buildHomeDirPath();
  const projectsAreaDirPath = path.join(homeDirPath, 'projects');
  return projectsAreaDirPath;
}

function buildWorkflowRunDirPath(args: { projectId: string; workflowRunId: string }) {
  const { projectId, workflowRunId } = args;

  const projectsAreaDirPath = buildProjectsAreaDirPath();
  const workflowRunDirPath = path.join(projectsAreaDirPath, projectId, workflowRunId);
  return workflowRunDirPath;
}

export function buildWorktreePath(args: { projectId: string; workflowRunId: string }) {
  const workflowRunDirPath = buildWorkflowRunDirPath(args);
  const worktreePath = path.join(workflowRunDirPath, 'worktree');
  return worktreePath;
}

type SpecPaths = {
  specConfigPath: string;
  specHooksDirPath: string;
  specWorkflowDirPath: string;
  specWorkflowPath: string;
};

export function buildSpecPaths(specDirPath: string, workflowId: string): SpecPaths {
  const specWorkflowDirPath = path.join(specDirPath, 'workflow');

  const specPaths: SpecPaths = {
    specConfigPath: path.join(specDirPath, 'config.yml'),
    specHooksDirPath: path.join(specDirPath, 'hooks'),
    specWorkflowDirPath,
    specWorkflowPath: path.join(specWorkflowDirPath, `${workflowId}.yml`),
  };
  return specPaths;
}

type WorkflowRunPaths = {
  workflowRunDirPath: string;
  specDirPath: string;
  artifactsDirPath: string;
};

export function buildWorkflowRunPaths(args: {
  projectId: string;
  workflowRunId: string;
}): WorkflowRunPaths {
  const workflowRunDirPath = buildWorkflowRunDirPath(args);

  const workflowRunPaths: WorkflowRunPaths = {
    workflowRunDirPath,
    specDirPath: path.join(workflowRunDirPath, 'spec'),
    artifactsDirPath: path.join(workflowRunDirPath, 'artifacts'),
  };
  return workflowRunPaths;
}

export function buildHookRunWorktreePath(hookRunId: string) {
  const homeDirPath = buildHomeDirPath();
  const hookRunWorktreePath = path.join(homeDirPath, 'hook-runs', hookRunId);
  return hookRunWorktreePath;
}

function buildProjectDotDirPath(projectPath: string) {
  const projectDotDirPath = path.join(projectPath, '.orc');
  return projectDotDirPath;
}

export function buildProjectConfigPath(projectPath: string) {
  const projectDotDirPath = buildProjectDotDirPath(projectPath);
  const projectConfigPath = path.join(projectDotDirPath, 'config.yml');
  return projectConfigPath;
}

export function buildWorkflowsDirPath(projectPath: string) {
  const projectDotDirPath = buildProjectDotDirPath(projectPath);
  const workflowsDirPath = path.join(projectDotDirPath, 'workflows');
  return workflowsDirPath;
}

export function buildProjectHooksDirPath(projectPath: string) {
  const projectDotDirPath = buildProjectDotDirPath(projectPath);
  const projectHooksDirPath = path.join(projectDotDirPath, 'hooks');
  return projectHooksDirPath;
}

type ProjectPaths = {
  projectConfigPath: string;
  projectHooksDirPath: string;
  workflowsDirPath: string;
};

export function buildProjectPaths(projectPath: string): ProjectPaths {
  const projectPaths: ProjectPaths = {
    projectConfigPath: buildProjectConfigPath(projectPath),
    projectHooksDirPath: buildProjectHooksDirPath(projectPath),
    workflowsDirPath: buildWorkflowsDirPath(projectPath),
  };
  return projectPaths;
}

export function buildWorkflowPath(workflowsDirPath: string, workflowId: string) {
  const workflowPath = path.join(workflowsDirPath, `${workflowId}.yml`);
  return workflowPath;
}

export function buildSkillSourceDirPath() {
  const skillSourceDirPath = url.fileURLToPath(import.meta.resolve('#skills/orc'));
  return skillSourceDirPath;
}

type ProjectSkillDirPaths = {
  claudeSkillDirPath: string;
  agentsSkillDirPath: string;
};

export function buildProjectSkillDirPaths(projectPath: string): ProjectSkillDirPaths {
  const projectSkillDirPaths: ProjectSkillDirPaths = {
    claudeSkillDirPath: path.join(projectPath, '.claude', 'skills', 'orc'),
    agentsSkillDirPath: path.join(projectPath, '.agents', 'skills', 'orc'),
  };
  return projectSkillDirPaths;
}

export function buildSkillFilePath(skillDirPath: string) {
  const skillFilePath = path.join(skillDirPath, 'SKILL.md');
  return skillFilePath;
}
