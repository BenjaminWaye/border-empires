// Bounds the AI planner's broad-frontier-fallback origin sets to a small,
// evenly-strided sample — same technique as ai-expansion-objective.ts's
// MAX_TERRITORY_SAMPLE. Replaces the old SKIP_BROAD_FALLBACK_OWNED_TILE_THRESHOLD
// (which skipped the broad fallback entirely once an empire exceeded 500
// owned tiles, to avoid an unbounded full-array scan) — that permanently
// disabled the ONLY mechanism that lets the AI look beyond a locally-waste
// narrow/focus window. Confirmed in production: 4/5 staging AI players
// (501-1667 owned tiles) never issued a single EXPAND command because of
// this. See automation-command-planner.ts's broad-fallback section and its
// regression tests (automation-command-planner.broad-fallback-bound.test.ts).
export const BROAD_FALLBACK_FRONTIER_SAMPLE_CAP = 300;

export const strideSample = <T>(items: readonly T[], maxCount: number): readonly T[] => {
  if (items.length <= maxCount) return items;
  const step = Math.max(1, Math.ceil(items.length / maxCount));
  const sampled: T[] = [];
  for (let i = 0; i < items.length; i += step) sampled.push(items[i]!);
  return sampled;
};
