import { z } from 'zod';

export const SETUP_VERSION = 6;

export const SetupStampSchema = z.object({
  setupVersion: z.int().positive(),
  completedAt: z.iso.datetime(),
});

export type SetupStamp = z.infer<typeof SetupStampSchema>;
