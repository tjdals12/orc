import { z } from 'zod';

import { ClaudeAgentSchema } from './provider/claude.js';
import { CodexAgentSchema } from './provider/codex.js';
import { GrokAgentSchema } from './provider/grok.js';

const IdSchema = z
  .string()
  .regex(/^[a-z0-9_-]+$/, 'must contain only lowercase letters, digits, hyphens and underscores');

const ArtifactNameSchema = z
  .string()
  .regex(
    /^[a-z0-9_.-]+$/,
    'must contain only lowercase letters, digits, dots, hyphens and underscores',
  )
  .refine((name) => name !== '.' && name !== '..', 'must not be "." or ".."');

const WorkflowNodeBaseSchema = z.strictObject({
  id: IdSchema,
  depends_on: z.array(IdSchema).optional(),
  produces: z.array(ArtifactNameSchema).optional(),
  consumes: z.array(ArtifactNameSchema).optional(),
});

const BashNodeSchema = WorkflowNodeBaseSchema.extend({
  type: z.literal('bash'),
  script: z.string().min(1),
});

const COMPLETION_KEYS = ['completion_signal', 'completion_bash'] as const;

const LoopSchema = z
  .strictObject({
    completion_signal: z
      .string()
      .trim()
      .min(1)
      .refine((signal) => !signal.includes('\n'), 'must be a single line')
      .optional(),
    completion_bash: z.string().min(1).optional(),
    max_iterations: z.int().positive(),
  })
  .superRefine((loop, ctx) => {
    const declaredKeys = COMPLETION_KEYS.filter((key) => loop[key] !== undefined);
    if (declaredKeys.length === 1) return;

    const message =
      declaredKeys.length === 0
        ? `must declare exactly one of: ${COMPLETION_KEYS.join(', ')}`
        : `must declare only one of: ${declaredKeys.join(', ')}`;
    ctx.addIssue({ code: 'custom', message });
  });

export type LoopFile = z.infer<typeof LoopSchema>;

const AgentNodeBaseSchema = WorkflowNodeBaseSchema.extend({
  type: z.literal('agent'),
  prompt: z.string().trim().min(1),
  loop: LoopSchema.optional(),
});

const ClaudeAgentNodeSchema = AgentNodeBaseSchema.extend(ClaudeAgentSchema.shape);

const CodexAgentNodeSchema = AgentNodeBaseSchema.extend(CodexAgentSchema.shape);

const GrokAgentNodeSchema = AgentNodeBaseSchema.extend(GrokAgentSchema.shape);

const AgentNodeSchema = z.discriminatedUnion('provider', [
  ClaudeAgentNodeSchema,
  CodexAgentNodeSchema,
  GrokAgentNodeSchema,
]);

const BashOnRejectSchema = z.strictObject({
  type: z.literal('bash'),
  script: z.string().min(1),
});

const AgentOnRejectBaseSchema = z.strictObject({
  type: z.literal('agent'),
  prompt: z.string().trim().min(1),
});

const ClaudeAgentOnRejectSchema = AgentOnRejectBaseSchema.extend(ClaudeAgentSchema.shape);

const CodexAgentOnRejectSchema = AgentOnRejectBaseSchema.extend(CodexAgentSchema.shape);

const AgentOnRejectSchema = z.discriminatedUnion('provider', [
  ClaudeAgentOnRejectSchema,
  CodexAgentOnRejectSchema,
]);

const OnRejectSchema = z.discriminatedUnion('type', [BashOnRejectSchema, AgentOnRejectSchema]);

const ApprovalNodeSchema = WorkflowNodeBaseSchema.extend({
  type: z.literal('approval'),
  message: z.string().trim().min(1),
  on_reject: OnRejectSchema.optional(),
});

export const WorkflowNodeSchema = z.discriminatedUnion('type', [
  BashNodeSchema,
  AgentNodeSchema,
  ApprovalNodeSchema,
]);

export type BashNodeFile = z.infer<typeof BashNodeSchema>;

export type ClaudeAgentNodeFile = z.infer<typeof ClaudeAgentNodeSchema>;

export type CodexAgentNodeFile = z.infer<typeof CodexAgentNodeSchema>;

export type GrokAgentNodeFile = z.infer<typeof GrokAgentNodeSchema>;

export type AgentNodeFile = z.infer<typeof AgentNodeSchema>;

export type BashOnRejectFile = z.infer<typeof BashOnRejectSchema>;

export type ClaudeAgentOnRejectFile = z.infer<typeof ClaudeAgentOnRejectSchema>;

export type CodexAgentOnRejectFile = z.infer<typeof CodexAgentOnRejectSchema>;

export type AgentOnRejectFile = z.infer<typeof AgentOnRejectSchema>;

export type OnRejectFile = z.infer<typeof OnRejectSchema>;

export type ApprovalNodeFile = z.infer<typeof ApprovalNodeSchema>;

export type WorkflowNodeFile = z.infer<typeof WorkflowNodeSchema>;
