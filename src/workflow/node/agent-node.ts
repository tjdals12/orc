import type { ClaudeAgentNode } from './claude-agent-node.js';
import type { CodexAgentNode } from './codex-agent-node.js';
import type { Loop } from './loop.js';
import { WorkflowNodeBase } from './workflow-node.js';

export abstract class AgentNodeBase extends WorkflowNodeBase {
  private readonly _prompt: string;
  private readonly _model: string;
  private readonly _loop: Loop | null;

  protected constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
    prompt: string;
    model: string;
    loop: Loop | null;
  }) {
    super({
      id: args.id,
      dependsOn: args.dependsOn,
      produces: args.produces,
      consumes: args.consumes,
    });
    this._prompt = args.prompt;
    this._model = args.model;
    this._loop = args.loop;
  }

  get type(): 'agent' {
    return 'agent';
  }

  get prompt(): string {
    return this._prompt;
  }

  get model(): string {
    return this._model;
  }

  get loop(): Loop | null {
    return this._loop;
  }

  readText(): string {
    return this._prompt;
  }

  abstract get provider(): 'claude' | 'codex';
}

export type AgentNode = ClaudeAgentNode | CodexAgentNode;
