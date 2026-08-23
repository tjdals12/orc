import type { WorkflowRunsResult } from '#cli/workflow/handlers/workflow-runs.handler.js';
import {
  formatCommandRows,
  formatDeadRunStatus,
  formatDeadRunStatusText,
  formatDuration,
  formatRelativeTime,
  measureColumnWidth,
  padToWidth,
  runStatusColor,
  style,
} from '#cli/output.js';

export function renderWorkflowRunsResult(result: WorkflowRunsResult): void {
  const { entries, totalCount } = result;

  if (entries.length === 0) {
    console.log('No runs yet.');
    if (process.stdout.isTTY) {
      console.log('');
      console.log(`  Run a workflow:  ${style.ident('orc workflow run <id>')}`);
    }
    return;
  }

  const rows = entries.map(({ run, isDead }) => ({
    id: run.id,
    project: run.project_name,
    workflow: run.workflow_id,
    status: run.status,
    statusText: isDead ? formatDeadRunStatusText(run.status) : run.status,
    isDead,
    age: formatRelativeTime(run.created_at),
    duration: formatDuration(run.started_at, run.finished_at),
  }));

  const idWidth = measureColumnWidth(['RUN', ...rows.map((row) => row.id)]);
  const projectWidth = measureColumnWidth(['PROJECT', ...rows.map((row) => row.project)]);
  const workflowWidth = measureColumnWidth(['WORKFLOW', ...rows.map((row) => row.workflow)]);
  const statusWidth = measureColumnWidth(['STATUS', ...rows.map((row) => row.statusText)]);
  const ageWidth = measureColumnWidth(['AGE', ...rows.map((row) => row.age)]);

  const header = [
    padToWidth('RUN', idWidth),
    padToWidth('PROJECT', projectWidth),
    padToWidth('WORKFLOW', workflowWidth),
    padToWidth('STATUS', statusWidth),
    padToWidth('AGE', ageWidth),
    'DURATION',
  ].join('  ');
  console.log(style.strong(header));

  for (const row of rows) {
    const statusColored = row.isDead
      ? formatDeadRunStatus(row.status)
      : runStatusColor(row.status)(row.status);
    const cells = [
      style.ident(padToWidth(row.id, idWidth)),
      padToWidth(row.project, projectWidth),
      padToWidth(row.workflow, workflowWidth),
      padToWidth(statusColored, statusWidth),
      padToWidth(row.age, ageWidth),
      style.muted(row.duration),
    ];
    console.log(cells.join('  '));
  }

  const truncated = totalCount > entries.length;
  if (truncated) {
    console.log('');
    console.log(style.muted(`(last ${entries.length} of ${totalCount})`));
  }

  if (process.stdout.isTTY) {
    console.log('');
    printRunsCommands();
  }
}

function printRunsCommands(): void {
  const rows: [string, string][] = [
    ['workflow status <run-id>', `Show a run's current state`],
    ['workflow stream <run-id>', `Replay run's events and logs`],
  ];

  console.log(style.strong('Commands:'));
  for (const line of formatCommandRows(rows)) {
    console.log(line);
  }
}
