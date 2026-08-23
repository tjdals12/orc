export type ApprovalNodeRunResult =
  { outcome: 'succeeded'; message: string } | { outcome: 'failed'; reason: string };

export type NodeRunResult = { outcome: 'succeeded' } | { outcome: 'failed'; reason: string };

export const loopVerdictKinds = ['complete', 'continue'] as const;
export type LoopVerdictKind = (typeof loopVerdictKinds)[number];
