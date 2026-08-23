export class ConfigError extends Error {}

export class NotFoundConfigError extends ConfigError {}

export class InvalidConfigError extends ConfigError {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.reason = reason;
  }
}
