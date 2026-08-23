import type { CodexAgentNodeFile } from './schema.js';
import { AgentNodeBase } from './agent-node.js';
import { Loop } from './loop.js';

type CodexAgentOptions = {
  modelReasoningEffort: string | null;
};

export class CodexAgentNode extends AgentNodeBase {
  private readonly _options: CodexAgentOptions;

  private constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
    prompt: string;
    model: string;
    loop: Loop | null;
    options: CodexAgentOptions;
  }) {
    super({
      id: args.id,
      dependsOn: args.dependsOn,
      produces: args.produces,
      consumes: args.consumes,
      prompt: args.prompt,
      model: args.model,
      loop: args.loop,
    });
    this._options = args.options;
  }

  static fromFile(file: CodexAgentNodeFile): CodexAgentNode {
    const codexAgentNode = new CodexAgentNode({
      id: file.id,
      dependsOn: file.depends_on ?? [],
      produces: file.produces ?? [],
      consumes: file.consumes ?? [],
      prompt: file.prompt,
      model: file.model,
      loop: file.loop === undefined ? null : Loop.fromFile(file.loop),
      options: {
        modelReasoningEffort: file.options?.model_reasoning_effort ?? null,
      },
    });
    return codexAgentNode;
  }

  get provider(): 'codex' {
    return 'codex';
  }

  get options(): CodexAgentOptions {
    return this._options;
  }
}
