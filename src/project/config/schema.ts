import { z } from 'zod';

import type { WorktreeHookPhase } from '#database/schema.js';
import { RunConfigSchema } from '#installation/config/schema.js';

export const PROJECT_CONFIG_VERSION = 1;

const HookFileSchema = z
  .string()
  .regex(
    /^[a-z0-9_.-]+(\/[a-z0-9_.-]+)*$/,
    'Hook entries are paths inside hooks/ (no leading slash).',
  )
  .refine((file) => file.split('/').every((segment) => segment !== '.' && segment !== '..'), {
    message: 'Hook entries must not contain "." or ".." segments.',
  });

export const WorktreeHookConfigSchema = z.strictObject({
  'post-create': z.array(HookFileSchema).optional(),
  'pre-remove': z.array(HookFileSchema).optional(),
  'post-remove': z.array(HookFileSchema).optional(),
} satisfies Record<WorktreeHookPhase, unknown>);

export const WorktreeConfigSchema = z.strictObject({
  include: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional(),
  hook: WorktreeHookConfigSchema.optional(),
});

export const ProjectConfigSchema = z.object({
  version: z.int().positive().max(PROJECT_CONFIG_VERSION),
  worktree: WorktreeConfigSchema.optional(),
  run: RunConfigSchema.optional(),
});

export type WorktreeConfigFile = z.infer<typeof WorktreeConfigSchema>;

export type ProjectConfigFile = z.infer<typeof ProjectConfigSchema>;
