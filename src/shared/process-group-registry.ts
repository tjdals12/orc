import type { ChildProcess } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

export type ProcessGroupObserver = {
  onProcessGroupStarted: (pgid: number) => Promise<void>;
  onProcessGroupStopped: (pgid: number) => Promise<void>;
};

export class ProcessGroupRegistry {
  private static readonly _children = new Set<ChildProcess>();

  private constructor() {}

  static register(child: ChildProcess): void {
    this._children.add(child);
    child.once('close', () => this._children.delete(child));
  }

  static stop(child: ChildProcess): void {
    const pid = child.pid;
    if (pid === undefined) return;

    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      return;
    }

    const forceTimer = setTimeout(() => {
      try {
        process.kill(-pid, 'SIGKILL');
      } catch {
        return;
      }
    }, 5000);
    forceTimer.unref();

    child.once('close', () => clearTimeout(forceTimer));
  }

  static kill(child: ChildProcess): void {
    const pid = child.pid;
    if (pid === undefined) {
      return;
    }

    try {
      process.kill(-pid, 'SIGKILL');
    } catch {
      return;
    }
  }

  static stopAll(): void {
    for (const child of this._children) {
      this.stop(child);
    }
  }

  static killAll(): void {
    for (const child of this._children) {
      this.kill(child);
    }
  }

  static async stopGroup(pgid: number): Promise<void> {
    if (!Number.isSafeInteger(pgid) || pgid <= 0) {
      throw new Error(`Invalid process group id: ${pgid}.`);
    }
    if (pgid === process.pid) {
      throw new Error(`Refusing to stop this process group: ${pgid}.`);
    }

    try {
      process.kill(-pgid, 'SIGINT');
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ESRCH') {
        return;
      }
      throw e;
    }

    const exitedAfterInterrupt = await this.waitForGroupExit(pgid, 5000);
    if (exitedAfterInterrupt) {
      return;
    }

    try {
      process.kill(-pgid, 'SIGKILL');
    } catch (e) {
      if (e instanceof Error && 'code' in e && e.code === 'ESRCH') {
        return;
      }
      throw e;
    }

    const exitedAfterKill = await this.waitForGroupExit(pgid, 1000);
    if (!exitedAfterKill) {
      throw new Error(`Process group ${pgid} did not stop after SIGKILL.`);
    }
  }

  private static async waitForGroupExit(pgid: number, graceMs: number): Promise<boolean> {
    const deadline = Date.now() + graceMs;
    while (true) {
      await delay(100);
      try {
        process.kill(-pgid, 0);
      } catch (e) {
        if (e instanceof Error && 'code' in e && e.code === 'ESRCH') {
          return true;
        }
        throw e;
      }

      const gracePeriodExpired = Date.now() >= deadline;
      if (gracePeriodExpired) {
        break;
      }
    }
    return false;
  }
}
