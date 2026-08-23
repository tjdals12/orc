import type { ChildProcess } from 'node:child_process';

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
}
