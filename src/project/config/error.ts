import { ProjectError } from '../error.js';

export class ProjectConfigError extends ProjectError {}

export class InvalidProjectConfigError extends ProjectConfigError {
  readonly reason: string;

  constructor(message: string, reason: string) {
    super(message);
    this.reason = reason;
  }
}
