import { z } from 'zod';

import { RunConfigSchema } from '#installation/config/schema.js';
import {
  ProjectConfigSchema,
  WorktreeConfigSchema,
  WorktreeHookConfigSchema,
} from '#project/config/schema.js';

export const MergedConfigSchema = ProjectConfigSchema.extend({
  run: RunConfigSchema.required(),
  worktree: WorktreeConfigSchema.required().extend({
    hook: WorktreeHookConfigSchema.required(),
  }),
});

export type MergedConfigFile = z.infer<typeof MergedConfigSchema>;
