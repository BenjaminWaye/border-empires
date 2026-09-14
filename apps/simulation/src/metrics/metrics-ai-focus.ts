// Extracted from metrics.ts (which sits at the repo's 500-line file cap) to make
// room for new metrics without growing that file past the cap.
//
// Observability for ai-spatial-focus.ts's per-tick cap (PR #1954): a front
// size that's always 0/absent for a player means the cap is silently
// disabled for them (no territory, or focusFrontTileKeys arrived empty), and
// a persistently nonzero fallback rate means the front is excluding every
// candidate every tick, so the cap isn't restricting anything for that
// player despite being wired in. Without these, both failure modes are
// invisible — see feedback_counter_on_skip_paths.md.
export const createAiFocusMetrics = () => {
  const simAiFocusFrontSize = new Map<string, number>();
  const simAiFocusFallbackTotal = new Map<string, number>();

  return {
    snapshot: () => ({
      simAiFocusFrontSize: Object.fromEntries(simAiFocusFrontSize),
      simAiFocusFallbackTotal: Object.fromEntries(simAiFocusFallbackTotal)
    }),
    // Gauge, not a counter: overwritten every tick a focus front is present.
    setSimAiFocusFrontSize(playerId: string, size: number): void {
      simAiFocusFrontSize.set(playerId, size);
    },
    incrementSimAiFocusFallback(playerId: string): void {
      simAiFocusFallbackTotal.set(playerId, (simAiFocusFallbackTotal.get(playerId) ?? 0) + 1);
    }
  };
};

export type AiFocusMetrics = ReturnType<typeof createAiFocusMetrics>;
