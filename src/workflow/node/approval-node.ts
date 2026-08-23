import { onRejectFromFile, type OnReject } from './on-reject.js';
import type { ApprovalNodeFile } from './schema.js';
import { WorkflowNodeBase } from './workflow-node.js';

export class ApprovalNode extends WorkflowNodeBase {
  private readonly _message: string;
  private readonly _onReject: OnReject | null;

  private constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
    message: string;
    onReject: OnReject | null;
  }) {
    super({
      id: args.id,
      dependsOn: args.dependsOn,
      produces: args.produces,
      consumes: args.consumes,
    });
    this._message = args.message;
    this._onReject = args.onReject;
  }

  static fromFile(file: ApprovalNodeFile): ApprovalNode {
    const approvalNode = new ApprovalNode({
      id: file.id,
      dependsOn: file.depends_on ?? [],
      produces: file.produces ?? [],
      consumes: file.consumes ?? [],
      message: file.message,
      onReject: file.on_reject === undefined ? null : onRejectFromFile(file.on_reject),
    });
    return approvalNode;
  }

  get type(): 'approval' {
    return 'approval';
  }

  get message(): string {
    return this._message;
  }

  get onReject(): OnReject | null {
    return this._onReject;
  }

  readText(): string {
    return this._message;
  }
}
