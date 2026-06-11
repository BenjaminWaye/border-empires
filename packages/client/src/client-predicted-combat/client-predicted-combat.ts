export const shouldFinalizePredictedCombat = (opts: {
  now: number;
  resolvesAt?: number | undefined;
  captureTargetKey?: string | undefined;
  revealTargetKey?: string | undefined;
  revealed?: boolean | undefined;
  hasPredictedResult?: boolean | undefined;
}): boolean =>
  typeof opts.resolvesAt === "number" &&
  opts.now > opts.resolvesAt &&
  Boolean(opts.captureTargetKey) &&
  opts.captureTargetKey === opts.revealTargetKey &&
  opts.revealed !== true &&
  opts.hasPredictedResult === true;

export const wasPredictedCombatAlreadyShown = (
  shown: Map<string, { title: string; detail: string }>,
  targetKey: string,
  title: string,
  detail: string
): boolean => {
  const entry = shown.get(targetKey);
  return Boolean(entry && entry.title === title && entry.detail === detail);
};
