import type {
  BashOnRejectFile,
  ClaudeAgentOnRejectFile,
  CodexAgentOnRejectFile,
  GrokAgentOnRejectFile,
  OnRejectFile,
} from './schema.js';
import { tokenizeText } from './text-token.js';

export class BashOnReject {
  private readonly _script: string;

  private constructor(args: { script: string }) {
    this._script = args.script;
  }

  static fromFile(file: BashOnRejectFile): BashOnReject {
    const bashOnReject = new BashOnReject({ script: file.script });
    return bashOnReject;
  }

  get type(): 'bash' {
    return 'bash';
  }

  get script(): string {
    return this._script;
  }

  referencesReason(): boolean {
    return false;
  }
}

export abstract class AgentOnRejectBase {
  private readonly _prompt: string;
  private readonly _model: string;

  protected constructor(args: { prompt: string; model: string }) {
    this._prompt = args.prompt;
    this._model = args.model;
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

  referencesReason(): boolean {
    const { tokens } = tokenizeText(this._prompt);
    const referencesReason = tokens.some((token) => token.kind === 'reason');
    return referencesReason;
  }

  abstract get provider(): 'claude' | 'codex' | 'grok';
}

type ClaudeAgentOnRejectOptions = {
  effort: string | null;
  maxTurns: number | null;
};

export class ClaudeAgentOnReject extends AgentOnRejectBase {
  private readonly _options: ClaudeAgentOnRejectOptions;

  private constructor(args: {
    prompt: string;
    model: string;
    options: ClaudeAgentOnRejectOptions;
  }) {
    super({
      prompt: args.prompt,
      model: args.model,
    });
    this._options = args.options;
  }

  static fromFile(file: ClaudeAgentOnRejectFile): ClaudeAgentOnReject {
    const claudeAgentOnReject = new ClaudeAgentOnReject({
      prompt: file.prompt,
      model: file.model,
      options: {
        effort: file.options?.effort ?? null,
        maxTurns: file.options?.max_turns ?? null,
      },
    });
    return claudeAgentOnReject;
  }

  get provider(): 'claude' {
    return 'claude';
  }

  get options(): ClaudeAgentOnRejectOptions {
    return this._options;
  }
}

type CodexAgentOnRejectOptions = {
  modelReasoningEffort: string | null;
};

export class CodexAgentOnReject extends AgentOnRejectBase {
  private readonly _options: CodexAgentOnRejectOptions;

  private constructor(args: { prompt: string; model: string; options: CodexAgentOnRejectOptions }) {
    super({
      prompt: args.prompt,
      model: args.model,
    });
    this._options = args.options;
  }

  static fromFile(file: CodexAgentOnRejectFile): CodexAgentOnReject {
    const codexAgentOnReject = new CodexAgentOnReject({
      prompt: file.prompt,
      model: file.model,
      options: {
        modelReasoningEffort: file.options?.model_reasoning_effort ?? null,
      },
    });
    return codexAgentOnReject;
  }

  get provider(): 'codex' {
    return 'codex';
  }

  get options(): CodexAgentOnRejectOptions {
    return this._options;
  }
}

type GrokAgentOnRejectOptions = {
  reasoningEffort: string | null;
  maxTurns: number | null;
};

export class GrokAgentOnReject extends AgentOnRejectBase {
  private readonly _options: GrokAgentOnRejectOptions;

  private constructor(args: { prompt: string; model: string; options: GrokAgentOnRejectOptions }) {
    super({
      prompt: args.prompt,
      model: args.model,
    });
    this._options = args.options;
  }

  static fromFile(file: GrokAgentOnRejectFile): GrokAgentOnReject {
    const grokAgentOnReject = new GrokAgentOnReject({
      prompt: file.prompt,
      model: file.model,
      options: {
        reasoningEffort: file.options?.reasoning_effort ?? null,
        maxTurns: file.options?.max_turns ?? null,
      },
    });
    return grokAgentOnReject;
  }

  get provider(): 'grok' {
    return 'grok';
  }

  get options(): GrokAgentOnRejectOptions {
    return this._options;
  }
}

export type AgentOnReject = ClaudeAgentOnReject | CodexAgentOnReject | GrokAgentOnReject;

export type OnReject = BashOnReject | AgentOnReject;

export function onRejectFromFile(file: OnRejectFile): OnReject {
  if (file.type === 'bash') {
    return BashOnReject.fromFile(file);
  }
  if (file.type === 'agent') {
    if (file.provider === 'claude') {
      return ClaudeAgentOnReject.fromFile(file);
    }
    if (file.provider === 'codex') {
      return CodexAgentOnReject.fromFile(file);
    }
    if (file.provider === 'grok') {
      return GrokAgentOnReject.fromFile(file);
    }
  }
  file satisfies never;
  throw new Error('Unknown on_reject type');
}
