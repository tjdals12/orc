import type { WorkflowRunExecutionState } from './types.js';

export class WorkflowRunCancellationWatch {
  private readonly _abortController = new AbortController();
  private _poll: NodeJS.Timeout | null = null;
  private _cancelled = false;
  private _unexpectedError: { error: unknown } | null = null;

  private readonly _checkWorkflowRunState: () => Promise<WorkflowRunExecutionState>;

  constructor(checkWorkflowRunState: () => Promise<WorkflowRunExecutionState>) {
    this._checkWorkflowRunState = checkWorkflowRunState;
  }

  get signal(): AbortSignal {
    return this._abortController.signal;
  }

  get unexpectedError(): { error: unknown } | null {
    return this._unexpectedError;
  }

  isCancelled(): boolean {
    return this._cancelled;
  }

  hasStopped(): boolean {
    const hasStopped = this._cancelled || this._unexpectedError !== null;
    return hasStopped;
  }

  start(): void {
    this._poll = setInterval(() => {
      void this.observe();
    }, 2000);
    this._poll.unref();
  }

  stop(): void {
    if (this._poll !== null) {
      clearInterval(this._poll);
      this._poll = null;
    }
  }

  async observe(): Promise<void> {
    if (this.hasStopped()) return;
    try {
      const state = await this._checkWorkflowRunState();
      if (state === 'deleted') {
        if (this._unexpectedError === null) {
          this._unexpectedError = { error: new Error('The workflow run no longer exists.') };
        }
        this._abortController.abort();
      }
      if (state === 'cancelled') {
        this._cancelled = true;
        this._abortController.abort();
      }
    } catch (e) {
      if (this._unexpectedError === null) {
        this._unexpectedError = { error: e };
      }
      this._abortController.abort();
    }
  }
}
