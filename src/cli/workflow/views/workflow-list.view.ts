import type { WorkflowListResult } from '#cli/workflow/handlers/workflow-list.handler.js';
import {
  formatCommandRows,
  measureColumnWidth,
  padToWidth,
  truncateToWidth,
  style,
  symbols,
} from '#cli/output.js';

export function renderWorkflowListResult(result: WorkflowListResult): void {
  const { workflows, brokenWorkflows } = result;

  if (workflows.length === 0 && brokenWorkflows.length === 0) {
    console.log('No workflows found.');
    if (process.stdout.isTTY) {
      console.log('');
      console.log(`  Add one at:  ${style.ident('.orc/workflows/<id>.yml')}`);
    }
    return;
  }

  if (workflows.length > 0) {
    const rows = workflows.map(({ id, description, input, nodes }) => {
      const singleLineDescription = description.replace(/\s+/g, ' ');
      return {
        id,
        description: truncateToWidth(singleLineDescription, 60),
        input: formatInputDeclaration(input === undefined ? null : input.required),
        nodeCount: nodes.length,
      };
    });

    const idWidth = measureColumnWidth(['ID', ...rows.map((row) => row.id)]);
    const descriptionWidth = measureColumnWidth([
      'DESCRIPTION',
      ...rows.map((row) => row.description),
    ]);
    const inputWidth = measureColumnWidth(['INPUT', ...rows.map((row) => row.input)]);
    const header = [
      padToWidth('ID', idWidth),
      padToWidth('DESCRIPTION', descriptionWidth),
      padToWidth('INPUT', inputWidth),
      'NODES',
    ].join('  ');

    console.log(style.strong(header));
    for (const row of rows) {
      const { id, description, input, nodeCount } = row;
      const line = [
        style.ident(padToWidth(id, idWidth)),
        padToWidth(description, descriptionWidth),
        padToWidth(input, inputWidth),
        nodeCount,
      ].join('  ');
      console.log(line);
    }
  }

  if (brokenWorkflows.length > 0) {
    if (workflows.length > 0) {
      console.log('');
    }

    console.log(
      `${style.warn(symbols.warn)} ${brokenWorkflows.length} ${brokenWorkflows.length === 1 ? 'file' : 'files'} could not be loaded:`,
    );
    for (const brokenWorkflow of brokenWorkflows) {
      console.log(`  ${style.ident(brokenWorkflow.file)}`);
    }

    if (process.stdout.isTTY) {
      console.log('');
      console.log(`  See details:  ${style.ident('orc workflow validate <id>')}`);
    }
  }

  if (process.stdout.isTTY) {
    console.log('');
    printWorkflowCommands();
  }
}

function formatInputDeclaration(inputRequired: boolean | null): string {
  if (inputRequired === null) return '-';
  return inputRequired ? 'required' : 'optional';
}

function printWorkflowCommands(): void {
  const rows: [string, string][] = [
    ['workflow run <id>', 'Run a workflow'],
    ['workflow runs', 'List recent runs'],
  ];

  console.log(style.strong('Commands:'));
  for (const line of formatCommandRows(rows)) {
    console.log(line);
  }
}
