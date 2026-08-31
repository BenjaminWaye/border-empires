// Extracted from client-state.ts (which is at the 500-line file cap) purely
// to keep that file's growth budget available for new state fields — no
// behavior change. Zeroed per-resource upkeep breakdown used as the initial
// `upkeepLastTick` value until the first real tick overwrites it.
export const createInitialUpkeepLastTick = () => ({
  food: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
  titanium: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
  umbrite: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
  crystal: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
  gold: { need: 0, fromYield: 0, fromStock: 0, remaining: 0, contributors: [] },
  foodCoverage: 1
});
