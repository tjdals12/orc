import type { BashNodeFile } from './schema.js';
import { WorkflowNodeBase } from './workflow-node.js';

export class BashNode extends WorkflowNodeBase {
  private readonly _script: string;

  private constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
    script: string;
  }) {
    super({
      id: args.id,
      dependsOn: args.dependsOn,
      produces: args.produces,
      consumes: args.consumes,
    });
    this._script = args.script;
  }

  static fromFile(file: BashNodeFile): BashNode {
    const bashNode = new BashNode({
      id: file.id,
      dependsOn: file.depends_on ?? [],
      produces: file.produces ?? [],
      consumes: file.consumes ?? [],
      script: file.script,
    });
    return bashNode;
  }

  get type(): 'bash' {
    return 'bash';
  }

  get script(): string {
    return this._script;
  }

  readText(): string {
    return this._script;
  }
}
