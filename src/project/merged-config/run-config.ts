export class RunConfig {
  private readonly _maxConcurrentNodes: number;

  constructor(args: { maxConcurrentNodes: number }) {
    this._maxConcurrentNodes = args.maxConcurrentNodes;
  }

  get maxConcurrentNodes(): number {
    return this._maxConcurrentNodes;
  }
}
