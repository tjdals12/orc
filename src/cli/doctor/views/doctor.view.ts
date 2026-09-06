import path from 'node:path';

import { measureColumnWidth, padToWidth, style, symbols } from '#cli/output.js';
import type {
  ConfigCheck,
  DoctorResult,
  ProjectConfigCheck,
  RegistrationStatus,
  SetupStatus,
} from '#cli/doctor/handlers/doctor.handler.js';
import type { ProviderDoctorStatus } from '#installation/provider/auth.js';
import type { SkillStatus } from '#project/skill.js';

function measureLabelWidth(providerStatuses: ProviderDoctorStatus[]): number {
  const labels: string[] = ['Setup', 'Config', 'Status', 'Git', 'Workflows', 'Hooks', 'Skill'];
  for (const provider of providerStatuses) {
    labels.push(provider.id);
  }
  const labelWidth = measureColumnWidth(labels);
  return labelWidth;
}

function printDoctorRow(args: {
  symbol: string;
  label: string;
  value: string;
  labelWidth: number;
}): void {
  console.log(`${args.symbol} ${padToWidth(args.label, args.labelWidth)}   ${args.value}`);
}

function printDetailLine(text: string, labelWidth: number): void {
  console.log(`${' '.repeat(labelWidth + 5)}${text}`);
}

function printCommandGuidance(command: string, labelWidth: number): void {
  printDetailLine(style.muted(`→  ${command}`), labelWidth);
}

function printPathGuidance(path_: string, labelWidth: number): void {
  printDetailLine(style.ident(path_), labelWidth);
}

function renderSetupRow(setup: SetupStatus, labelWidth: number): void {
  if (setup === 'complete') {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Setup',
      value: style.muted('complete'),
      labelWidth,
    });
    return;
  }
  if (setup === 'not-set-up') {
    printDoctorRow({
      symbol: style.muted(symbols.pending),
      label: 'Setup',
      value: style.muted('not set up'),
      labelWidth,
    });
    printCommandGuidance('orc setup', labelWidth);
    return;
  }
  if (setup === 'incomplete') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: 'Setup',
      value: style.muted('incomplete'),
      labelWidth,
    });
    printCommandGuidance('orc setup', labelWidth);
    return;
  }
  if (setup === 'newer-than-tool') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: 'Setup',
      value: style.muted('newer than this tool'),
      labelWidth,
    });
    printCommandGuidance('update orc', labelWidth);
    return;
  }
  setup satisfies never;
}

function renderConfigRow(
  check: ConfigCheck | ProjectConfigCheck | null,
  configPath: string,
  labelWidth: number,
): void {
  if (check === null) {
    printDoctorRow({
      symbol: style.muted(symbols.pending),
      label: 'Config',
      value: style.muted('not configured'),
      labelWidth,
    });
    return;
  }
  if (check.status === 'valid') {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Config',
      value: style.muted('valid'),
      labelWidth,
    });
    return;
  }

  printDoctorRow({
    symbol: style.warn(symbols.warn),
    label: 'Config',
    value: style.muted('invalid'),
    labelWidth,
  });
  for (const line of check.reason.split('\n')) {
    printDetailLine(style.muted(line), labelWidth);
  }
  printPathGuidance(configPath, labelWidth);
}

function renderProviderRow(provider: ProviderDoctorStatus, labelWidth: number): void {
  const { authStatus, cliStatus } = provider;
  if (cliStatus?.status === 'not-found') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: provider.id,
      value: style.muted('CLI not found'),
      labelWidth,
    });
    printDetailLine(style.muted(cliStatus.installHint), labelWidth);
    return;
  }
  if (cliStatus?.status === 'check-failed') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: provider.id,
      value: style.muted('unable to check CLI'),
      labelWidth,
    });
    printCommandGuidance(cliStatus.checkCommand, labelWidth);
    return;
  }
  if (cliStatus?.status === 'unsupported') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: provider.id,
      value: style.muted(`CLI not supported (supports ${cliStatus.supportedVersionRange})`),
      labelWidth,
    });
    printCommandGuidance(cliStatus.updateCommand, labelWidth);
    return;
  }

  const authDetail = authStatus.status === 'signed-in' ? 'signed in' : 'not signed in';
  if (cliStatus?.status === 'may-be-incompatible') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: provider.id,
      value: style.muted(
        `${authDetail} · version may be incompatible (supports ${cliStatus.supportedVersionRange})`,
      ),
      labelWidth,
    });
    if (authStatus.status !== 'signed-in') {
      printCommandGuidance(`orc auth login ${provider.id}`, labelWidth);
    }
    return;
  }

  const status = authStatus;
  if (status.status === 'signed-in') {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: provider.id,
      value: style.muted('signed in'),
      labelWidth,
    });
    return;
  }
  if (status.status === 'signed-out') {
    printDoctorRow({
      symbol: style.muted(symbols.pending),
      label: provider.id,
      value: style.muted('not signed in'),
      labelWidth,
    });
    printCommandGuidance(`orc auth login ${provider.id}`, labelWidth);
    return;
  }
  if (status.status === 'cli-not-found') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: provider.id,
      value: style.muted('CLI not found'),
      labelWidth,
    });
    printCommandGuidance('reinstall orc', labelWidth);
    return;
  }
  if (status.status === 'check-failed') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: provider.id,
      value: style.muted('check failed'),
      labelWidth,
    });
    printCommandGuidance(`orc auth login ${provider.id}`, labelWidth);
    return;
  }
  status satisfies never;
}

function renderStatusRow(registration: RegistrationStatus, labelWidth: number): void {
  if (registration.status === 'registered') {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Status',
      value: style.muted('registered'),
      labelWidth,
    });
    return;
  }
  if (registration.status === 'not-registered') {
    printDoctorRow({
      symbol: style.muted(symbols.pending),
      label: 'Status',
      value: style.muted('not registered'),
      labelWidth,
    });
    printCommandGuidance('orc project add <name>', labelWidth);
    return;
  }
  if (registration.status === 'incomplete') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: 'Status',
      value: style.muted('incomplete'),
      labelWidth,
    });
    printCommandGuidance(`orc project add ${registration.name}`, labelWidth);
    return;
  }
  registration satisfies never;
}

function renderGitRow(gitReady: boolean, labelWidth: number): void {
  if (gitReady) {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Git',
      value: style.muted('ready'),
      labelWidth,
    });
    return;
  }
  printDoctorRow({
    symbol: style.muted(symbols.pending),
    label: 'Git',
    value: style.muted('not initialized or no commits yet'),
    labelWidth,
  });
}

function renderWorkflowsRow(workflowCount: number, labelWidth: number): void {
  if (workflowCount > 0) {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Workflows',
      value: style.muted(String(workflowCount)),
      labelWidth,
    });
    return;
  }
  printDoctorRow({
    symbol: style.muted(symbols.pending),
    label: 'Workflows',
    value: style.muted('none yet'),
    labelWidth,
  });
}

function renderHooksRow(hookCount: number | null, labelWidth: number): void {
  if (hookCount !== null && hookCount > 0) {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Hooks',
      value: style.muted(String(hookCount)),
      labelWidth,
    });
    return;
  }
  printDoctorRow({
    symbol: style.muted(symbols.pending),
    label: 'Hooks',
    value: style.muted('none yet'),
    labelWidth,
  });
}

function renderSkillRow(skill: SkillStatus, labelWidth: number): void {
  if (skill.status === 'installed') {
    printDoctorRow({
      symbol: style.success(symbols.ok),
      label: 'Skill',
      value: style.muted('installed'),
      labelWidth,
    });
    return;
  }
  if (skill.status === 'not-installed') {
    printDoctorRow({
      symbol: style.muted(symbols.pending),
      label: 'Skill',
      value: style.muted('not installed'),
      labelWidth,
    });
    printCommandGuidance('orc skill install', labelWidth);
    return;
  }
  if (skill.status === 'outdated') {
    printDoctorRow({
      symbol: style.warn(symbols.warn),
      label: 'Skill',
      value: style.muted('outdated'),
      labelWidth,
    });
    printCommandGuidance('orc skill install', labelWidth);
    return;
  }
  skill satisfies never;
}

function renderInstallationSection(
  installation: DoctorResult['installation'],
  labelWidth: number,
): void {
  console.log('');
  console.log(style.strong('Installation'));

  renderSetupRow(installation.setupStatus, labelWidth);
  renderConfigRow(installation.configCheck, installation.configPath, labelWidth);
}

function renderProvidersSection(
  providerStatuses: ProviderDoctorStatus[],
  labelWidth: number,
): void {
  console.log('');
  console.log(style.strong('Providers'));

  for (const provider of providerStatuses) {
    renderProviderRow(provider, labelWidth);
  }
}

function renderProjectSection(project: DoctorResult['project'], labelWidth: number): void {
  console.log('');
  console.log(style.strong('Project'));

  renderStatusRow(project.registrationStatus, labelWidth);
  const relativeConfigPath = path.relative(project.path, project.configPath);
  renderConfigRow(project.configCheck, relativeConfigPath, labelWidth);
  renderGitRow(project.gitReady, labelWidth);
  renderWorkflowsRow(project.workflowCount, labelWidth);
  renderHooksRow(project.hookCount, labelWidth);
  renderSkillRow(project.skill, labelWidth);
}

export function renderDoctorResult(result: DoctorResult): void {
  const labelWidth = measureLabelWidth(result.installation.providerStatuses);
  renderInstallationSection(result.installation, labelWidth);
  renderProvidersSection(result.installation.providerStatuses, labelWidth);
  renderProjectSection(result.project, labelWidth);
}
