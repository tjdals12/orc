import ora, { type Ora } from 'ora';

export interface ProgressReporter {
  start(label: string): void;
  stop(): void;
}

export class SpinnerProgressReporter implements ProgressReporter {
  private _spinner: Ora | null = null;

  start(label: string): void {
    this._spinner = ora(label).start();
  }

  stop(): void {
    this._spinner?.stop();
    this._spinner = null;
  }
}

export class SilentProgressReporter implements ProgressReporter {
  start(): void {}

  stop(): void {}
}
