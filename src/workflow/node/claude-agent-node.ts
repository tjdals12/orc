import type { ClaudeAgentNodeFile } from './schema.js';
import { AgentNodeBase } from './agent-node.js';
import { Loop } from './loop.js';

type ClaudeAgentOptions = {
  effort: string | null;
  maxTurns: number | null;
};

export class ClaudeAgentNode extends AgentNodeBase {
  private readonly _options: ClaudeAgentOptions;

  private constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
    prompt: string;
    model: string;
    loop: Loop | null;
    options: ClaudeAgentOptions;
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

  static fromFile(file: ClaudeAgentNodeFile): ClaudeAgentNode {
    const claudeAgentNode = new ClaudeAgentNode({
      id: file.id,
      dependsOn: file.depends_on ?? [],
      produces: file.produces ?? [],
      consumes: file.consumes ?? [],
      prompt: file.prompt,
      model: file.model,
      loop: file.loop === undefined ? null : Loop.fromFile(file.loop),
      options: {
        effort: file.options?.effort ?? null,
        maxTurns: file.options?.max_turns ?? null,
      },
    });
    return claudeAgentNode;
  }

  get provider(): 'claude' {
    return 'claude';
  }

  get options(): ClaudeAgentOptions {
    return this._options;
  }
}
