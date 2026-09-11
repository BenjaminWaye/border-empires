// Extracted from client-state.ts (which is at the 500-line file cap) purely
// to keep that file's growth budget available for new state fields — no
// behavior change. Per-strategic-resource flash-animation state (which way,
// and until when, the HUD number should flash after a delta).
export const createInitialStrategicAnim = () => ({
  FOOD: { until: 0, dir: 0 as -1 | 0 | 1 },
  TITANIUM: { until: 0, dir: 0 as -1 | 0 | 1 },
  CRYSTAL: { until: 0, dir: 0 as -1 | 0 | 1 },
  UMBRITE: { until: 0, dir: 0 as -1 | 0 | 1 },
  SHARD: { until: 0, dir: 0 as -1 | 0 | 1 }
});
