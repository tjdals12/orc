import { Command } from 'commander';

import { SilentProgressReporter, SpinnerProgressReporter } from '#cli/progress-reporter.js';
import { DoctorHandler } from '#cli/doctor/handlers/doctor.handler.js';
import { printJson } from '#cli/output.js';
import { renderDoctorResult } from '#cli/doctor/views/doctor.view.js';

export const doctorCommand = new Command('doctor')
  .description('Show whether this machine and the current project are ready')
  .option('--json', 'Output machine-readable JSON')
  .action(async (options: { json?: boolean }) => {
    const projectPath = process.cwd();

    const reporter = options.json ? new SilentProgressReporter() : new SpinnerProgressReporter();
    const handler = new DoctorHandler(reporter);
    const result = await handler.execute(projectPath);

    if (options.json) {
      printJson(handler.toJson(result));
      return;
    }

    renderDoctorResult(result);
  });
