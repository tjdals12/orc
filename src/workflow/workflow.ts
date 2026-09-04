import { BashNode } from './node/bash-node.js';
import { ClaudeAgentNode } from './node/claude-agent-node.js';
import { CodexAgentNode } from './node/codex-agent-node.js';
import { GrokAgentNode } from './node/grok-agent-node.js';
import type { AgentNode } from './node/agent-node.js';
import { ApprovalNode } from './node/approval-node.js';
import type { WorkflowNode } from './node/workflow-node.js';
import type { AgentNodeFile, WorkflowNodeFile } from './node/schema.js';
import type { WorkflowFile } from './schema.js';

type WorkflowInput = {
  required: boolean;
  description: string;
};

function buildAgentNode(file: AgentNodeFile): AgentNode {
  switch (file.provider) {
    case 'claude': {
      const claudeAgentNode = ClaudeAgentNode.fromFile(file);
      return claudeAgentNode;
    }
    case 'codex': {
      const codexAgentNode = CodexAgentNode.fromFile(file);
      return codexAgentNode;
    }
    case 'grok': {
      const grokAgentNode = GrokAgentNode.fromFile(file);
      return grokAgentNode;
    }
  }
}

function buildWorkflowNode(file: WorkflowNodeFile): WorkflowNode {
  switch (file.type) {
    case 'bash': {
      const bashNode = BashNode.fromFile(file);
      return bashNode;
    }
    case 'agent': {
      const agentNode = buildAgentNode(file);
      return agentNode;
    }
    case 'approval': {
      const approvalNode = ApprovalNode.fromFile(file);
      return approvalNode;
    }
  }
}

export class Workflow {
  private readonly _sourcePath: string;
  private readonly _version: number;
  private readonly _id: string;
  private readonly _description: string;
  private readonly _input: WorkflowInput | null;
  private readonly _nodes: WorkflowNode[];

  private constructor(args: {
    sourcePath: string;
    version: number;
    id: string;
    description: string;
    input: WorkflowInput | null;
    nodes: WorkflowNode[];
  }) {
    this._sourcePath = args.sourcePath;
    this._version = args.version;
    this._id = args.id;
    this._description = args.description;
    this._input = args.input;
    this._nodes = args.nodes;
  }

  static fromFile(sourcePath: string, file: WorkflowFile): Workflow {
    const workflow = new Workflow({
      sourcePath,
      version: file.version,
      id: file.id,
      description: file.description,
      input: file.input ?? null,
      nodes: file.nodes.map((node) => buildWorkflowNode(node)),
    });
    return workflow;
  }

  get sourcePath(): string {
    return this._sourcePath;
  }

  get id(): string {
    return this._id;
  }

  get description(): string {
    return this._description;
  }

  get input(): WorkflowInput | null {
    return this._input;
  }

  get nodes(): WorkflowNode[] {
    return this._nodes;
  }

  declaresInput(): boolean {
    const declaresInput = this._input !== null;
    return declaresInput;
  }

  requiresInput(): boolean {
    const requiresInput = this._input !== null && this._input.required === true;
    return requiresInput;
  }

  listNodeIds(): string[] {
    const nodeIds = this._nodes.map((node) => node.id);
    return nodeIds;
  }

  declaresArtifacts(): boolean {
    const declaresArtifacts = this._nodes.some(
      (node) => node.produces.length > 0 || node.consumes.length > 0,
    );
    return declaresArtifacts;
  }

  findNode(nodeId: string): WorkflowNode | null {
    const workflowNode = this._nodes.find((node) => node.id === nodeId);
    return workflowNode ?? null;
  }

  findApprovalNode(nodeId: string): ApprovalNode | null {
    const workflowNode = this.findNode(nodeId);
    if (!workflowNode || workflowNode.type !== 'approval') {
      return null;
    }
    return workflowNode;
  }
}
