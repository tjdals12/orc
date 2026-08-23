import type { LoopFile } from './schema.js';

export type LoopCompletion = { kind: 'signal'; signal: string } | { kind: 'bash'; script: string };

export class Loop {
  private readonly _maxIterations: number;
  private readonly _completion: LoopCompletion;

  private constructor(args: { maxIterations: number; completion: LoopCompletion }) {
    this._maxIterations = args.maxIterations;
    this._completion = args.completion;
  }

  static fromFile(file: LoopFile): Loop {
    const maxIterations = file.max_iterations;

    if (file.completion_bash !== undefined) {
      const loop = new Loop({
        maxIterations,
        completion: { kind: 'bash', script: file.completion_bash },
      });
      return loop;
    }
    if (file.completion_signal !== undefined) {
      const loop = new Loop({
        maxIterations,
        completion: { kind: 'signal', signal: file.completion_signal },
      });
      return loop;
    }

    throw new Error('A loop declared no completion key');
  }

  get maxIterations(): number {
    return this._maxIterations;
  }

  get completion(): LoopCompletion {
    return this._completion;
  }
}
