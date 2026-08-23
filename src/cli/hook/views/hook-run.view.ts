import type {
  HookRunCleanupFailureResult,
  HookRunDryRunResult,
  HookRunEnvironmentInfo,
  HookRunExecutionResult,
  HookRunHeaderInfo,
  HookRunNoHooksResult,
  HookRunResult,
} from '#cli/hook/handlers/hook-run.handler.js';
import {
  formatBashOutputBody,
  formatElapsedSeconds,
  formatInfoBlock,
  measureColumnWidth,
  padToWidth,
  style,
  symbols,
} from '#cli/output.js';
import type { WorktreeProvisionStep } from '#execution-environment/worktree.js';

function renderHookRunNoHooksResult(result: HookRunNoHooksResult): void {
  console.log(`No ${result.phase} hooks configured.`);
}

function renderHookRunDryRunResult(result: HookRunDryRunResult): void {
  const { renderedHooks } = result;

  for (const [index, { file, script }] of renderedHooks.entries()) {
    if (index > 0) {
      console.log('');
    }
    console.log(style.muted(`# ${file}`));
    console.log(script.trimEnd());
  }
}

export function renderHookRunHeader(info: HookRunHeaderInfo): void {
  console.error(`${style.ident(symbols.running)} Running ${info.phase} hooks`);
  console.error('');
}

export function renderHookRunEnvironmentInfo(info: HookRunEnvironmentInfo): void {
  const { branch, worktreePath } = info;

  console.error(style.strong('Worktree'));
  const rows: [string, string][] = [
    ['Branch', style.ident(branch)],
    ['Path', style.ident(worktreePath)],
  ];
  const lines = formatInfoBlock(rows);
  for (const line of lines) {
    console.error(line);
  }
  console.error('');
}

type HookRunStreamRenderer = {
  onStep: (step: WorktreeProvisionStep) => void;
  onHookOutput: (file: string, stream: 'stdout' | 'stderr', text: string) => void;
};

export function buildHookRunStreamRenderer(hookFiles: string[]): HookRunStreamRenderer {
  const fileWidth = measureColumnWidth(hookFiles);

  let streamTitlePrinted = false;

  const emitLine = (gutter: string, fileColumn: string, body: string) => {
    if (!streamTitlePrinted) {
      console.error(style.strong('Stream'));
      streamTitlePrinted = true;
    }
    console.error(`  ${gutter}  ${fileColumn}   ${body}`);
  };

  const onStep = (step: WorktreeProvisionStep) => {
    emitLine(symbols.runEvent, padToWidth('', fileWidth), formatStepBody(step));
  };

  const onHookOutput = (file: string, stream: 'stdout' | 'stderr', text: string) => {
    const gutter = style.muted(symbols.nodeLog);
    const fileColumn = style.muted(padToWidth(file, fileWidth));
    const body = formatBashOutputBody(stream, text);
    emitLine(gutter, fileColumn, body);
  };

  return {
    onStep,
    onHookOutput,
  };
}

function formatStepBody(step: WorktreeProvisionStep): string {
  switch (step.kind) {
    case 'create-worktree':
      return 'worktree_creating';
    case 'copy-ignored-files':
      return 'files_copying';
    case 'run-hook':
      return `hook_started  ${style.muted(step.file)}`;
  }
}

function renderHookRunExecutionResult(result: HookRunExecutionResult): void {
  const { hookCount, elapsedSeconds, cleanupFailures } = result;

  const hookNoun = hookCount === 1 ? 'hook' : 'hooks';
  const detail = style.muted(
    `·  ${hookCount} ${hookNoun}, ${formatElapsedSeconds(elapsedSeconds)}`,
  );
  console.error('');
  console.error(`${style.success(symbols.ok)} Succeeded  ${detail}`);

  renderHookRunCleanupFailureResult({ messages: cleanupFailures });
}

export function renderHookRunCleanupFailureResult(result: HookRunCleanupFailureResult): void {
  for (const message of result.messages) {
    console.error(`${style.warn(symbols.warn)} Cleanup failed  ${style.muted(`·  ${message}`)}`);
  }
}

export function renderHookRunResult(result: HookRunResult): void {
  if (result.outcome === 'no-hooks') {
    renderHookRunNoHooksResult(result);
    return;
  }
  if (result.outcome === 'dry-run') {
    renderHookRunDryRunResult(result);
    return;
  }
  if (result.outcome === 'executed') {
    renderHookRunExecutionResult(result);
    return;
  }

  result satisfies never;
}
