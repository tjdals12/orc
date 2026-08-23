import { z } from 'zod';

export const GLOBAL_CONFIG_VERSION = 1;

export const DEFAULT_MAX_CONCURRENT_NODES = 2;

export const RunConfigSchema = z.strictObject({
  max_concurrent_nodes: z.int().positive().optional(),
});

export const GlobalConfigSchema = z.object({
  version: z.int().positive().max(GLOBAL_CONFIG_VERSION),
  run: RunConfigSchema.optional(),
});

export type GlobalConfigFile = z.infer<typeof GlobalConfigSchema>;
