export class WorkflowError extends Error {}

export class NotFoundWorkflowError extends WorkflowError {}

export class InvalidWorkflowError extends WorkflowError {
  readonly findings: string[];

  constructor(message: string, findings: string[]) {
    super(message);
    this.findings = findings;
  }
}
