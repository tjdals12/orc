import type { ProjectListResult } from '#cli/project/handlers/project-list.handler.js';
import { formatCommandRows, measureColumnWidth, padToWidth, style } from '#cli/output.js';

export function renderProjectListResult(result: ProjectListResult): void {
  const { projects } = result;

  if (projects.length === 0) {
    console.log('No projects registered.');
    if (process.stdout.isTTY) {
      console.log('');
      console.log(`  Register a project:  ${style.ident('orc project add <name>')}`);
    }
    return;
  }

  const nameWidth = measureColumnWidth(['NAME', ...projects.map((project) => project.name)]);
  const pathWidth = measureColumnWidth(['PATH', ...projects.map((project) => project.path)]);
  const header = [padToWidth('NAME', nameWidth), padToWidth('PATH', pathWidth), 'CREATED'].join(
    '  ',
  );

  console.log(style.strong(header));
  for (const project of projects) {
    const { name, path, created_at } = project;
    const line = [
      padToWidth(name, nameWidth),
      style.ident(padToWidth(path, pathWidth)),
      style.muted(created_at.slice(0, 10)),
    ].join('  ');
    console.log(line);
  }

  if (process.stdout.isTTY) {
    console.log('');
    printProjectCommands();
  }
}

function printProjectCommands(): void {
  const rows: [string, string][] = [
    ['project add <name>', 'Register a project'],
    ['project remove <name>', 'Unregister a project (keeps the directory)'],
    ['project prune <name>', `Delete a project's runs and artifacts`],
  ];

  console.log(style.strong('Commands:'));
  for (const line of formatCommandRows(rows)) {
    console.log(line);
  }
}
