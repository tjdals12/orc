import { z } from 'zod';

import { WorkflowNodeSchema } from './node/schema.js';

const WORKFLOW_VERSION = 1;

const IdSchema = z
  .string()
  .regex(/^[a-z0-9_-]+$/, 'must contain only lowercase letters, digits, hyphens and underscores');

const WorkflowInputSchema = z.strictObject({
  required: z.boolean(),
  description: z.string().trim().min(1),
});

export const WorkflowSchema = z.strictObject({
  version: z.int().positive().max(WORKFLOW_VERSION),
  id: IdSchema,
  description: z.string().trim().min(1),
  input: WorkflowInputSchema.optional(),
  nodes: z.array(WorkflowNodeSchema).min(1),
});

export type WorkflowFile = z.infer<typeof WorkflowSchema>;
