import type { AgentNode } from './agent-node.js';
import type { ApprovalNode } from './approval-node.js';
import type { BashNode } from './bash-node.js';

export abstract class WorkflowNodeBase {
  private readonly _id: string;
  private readonly _dependsOn: string[];
  private readonly _produces: string[];
  private readonly _consumes: string[];

  protected constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
  }) {
    this._id = args.id;
    this._dependsOn = args.dependsOn;
    this._produces = args.produces;
    this._consumes = args.consumes;
  }

  get id(): string {
    return this._id;
  }

  get dependsOn(): string[] {
    return this._dependsOn;
  }

  get produces(): string[] {
    return this._produces;
  }

  get consumes(): string[] {
    return this._consumes;
  }

  abstract get type(): 'bash' | 'agent' | 'approval';
}

export type WorkflowNode = BashNode | AgentNode | ApprovalNode;
