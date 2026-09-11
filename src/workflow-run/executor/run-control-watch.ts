import type { WorkflowRunExecutionState } from './types.js';

export const WORKFLOW_RUN_STOP_ABORT_REASON = 'workflow-run-stop-requested';

export class WorkflowRunControlWatch {
  private readonly _abortController = new AbortController();
  private _poll: NodeJS.Timeout | null = null;
  private _cancelled = false;
  private _stopRequested = false;
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

  isStopRequested(): boolean {
    return this._stopRequested;
  }

  hasInterrupted(): boolean {
    const interrupted = this._cancelled || this._stopRequested || this._unexpectedError !== null;
    return interrupted;
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
    if (this.hasInterrupted()) return;
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
      if (state === 'stopping') {
        this._stopRequested = true;
        this._abortController.abort(WORKFLOW_RUN_STOP_ABORT_REASON);
      }
    } catch (e) {
      if (this._unexpectedError === null) {
        this._unexpectedError = { error: e };
      }
      this._abortController.abort();
    }
  }
}
