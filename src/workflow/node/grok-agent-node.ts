import type { GrokAgentNodeFile } from './schema.js';
import { AgentNodeBase } from './agent-node.js';
import { Loop } from './loop.js';

type GrokAgentOptions = {
  reasoningEffort: string | null;
  maxTurns: number | null;
};

export class GrokAgentNode extends AgentNodeBase {
  private readonly _options: GrokAgentOptions;

  private constructor(args: {
    id: string;
    dependsOn: string[];
    produces: string[];
    consumes: string[];
    prompt: string;
    model: string;
    loop: Loop | null;
    options: GrokAgentOptions;
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

  static fromFile(file: GrokAgentNodeFile): GrokAgentNode {
    const grokAgentNode = new GrokAgentNode({
      id: file.id,
      dependsOn: file.depends_on ?? [],
      produces: file.produces ?? [],
      consumes: file.consumes ?? [],
      prompt: file.prompt,
      model: file.model,
      loop: file.loop === undefined ? null : Loop.fromFile(file.loop),
      options: {
        reasoningEffort: file.options?.reasoning_effort ?? null,
        maxTurns: file.options?.max_turns ?? null,
      },
    });
    return grokAgentNode;
  }

  get provider(): 'grok' {
    return 'grok';
  }

  get options(): GrokAgentOptions {
    return this._options;
  }
}
