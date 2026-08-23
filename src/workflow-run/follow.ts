import { setTimeout } from 'node:timers/promises';

import type { WorkflowRunEventType } from '#database/schema.js';

import type { WorkflowRunEvent, WorkflowRunHookLog, WorkflowRunNodeLog } from './repository.js';

export type WorkflowRunStreamEntry =
  | { kind: 'event'; event: WorkflowRunEvent }
  | { kind: 'log'; log: WorkflowRunNodeLog }
  | { kind: 'hook_log'; hookLog: WorkflowRunHookLog };

export type WorkflowRunState = 'running' | 'ended' | 'dead' | 'deleted';

export type WorkflowRunFollowOutcome = 'ended' | 'dead' | 'deleted';

export function resolveEntrySequence(entry: WorkflowRunStreamEntry): number {
  if (entry.kind === 'event') {
    return entry.event.sequence;
  }
  if (entry.kind === 'log') {
    return entry.log.sequence;
  }
  return entry.hookLog.sequence;
}

export async function followWorkflowRun(
  collectEntries: (cursor: number | null) => Promise<WorkflowRunStreamEntry[]>,
  checkRunState: () => Promise<WorkflowRunState>,
  onEntries: (entries: WorkflowRunStreamEntry[]) => void,
  options: {
    pollIntervalMs: number;
    drainGraceMs: number;
  },
): Promise<WorkflowRunFollowOutcome> {
  const { pollIntervalMs, drainGraceMs } = options;

  let cursor: number | null = null;
  let terminalEventSeen: boolean = false;

  const terminalEventTypes: WorkflowRunEventType[] = [
    'run_succeeded',
    'run_failed',
    'run_cancelled',
    'run_paused',
  ];

  const consumeNewEntries = async (): Promise<void> => {
    const entries = await collectEntries(cursor);
    if (entries.length === 0) {
      return;
    }

    for (const entry of entries) {
      cursor = resolveEntrySequence(entry);

      if (entry.kind !== 'event') {
        continue;
      }

      if (terminalEventTypes.includes(entry.event.type)) {
        terminalEventSeen = true;
      } else if (entry.event.type === 'run_resumed') {
        terminalEventSeen = false;
      }
    }

    onEntries(entries);
  };

  const drainUntilTerminalEvent = async (): Promise<void> => {
    const maxCycles = Math.ceil(drainGraceMs / pollIntervalMs);
    for (let cycle = 0; cycle < maxCycles; cycle += 1) {
      if (terminalEventSeen) {
        break;
      }
      await setTimeout(pollIntervalMs);
      await consumeNewEntries();
    }
  };

  while (true) {
    await consumeNewEntries();

    const state = await checkRunState();
    if (state === 'deleted') {
      return 'deleted';
    }
    if (state === 'ended') {
      await drainUntilTerminalEvent();
      return 'ended';
    }
    if (state === 'dead') {
      await consumeNewEntries();
      return 'dead';
    }
    state satisfies 'running';

    await setTimeout(pollIntervalMs);
  }
}
