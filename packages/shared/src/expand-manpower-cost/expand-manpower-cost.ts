import { EXPAND_MANPOWER_COST } from "../config.js";

// EXPAND's manpower price grows with how much unsettled frontier the player
// already holds: holding a wide, thin frontier gets steadily more expensive
// to keep extending, which pushes big empires to garrison what they claimed.
// Each anchor is [frontier tiles held, manpower per claim]; between anchors
// the price is interpolated and floored, so the anchors themselves are exact.
// Past the last anchor the last segment's slope continues (1 MP per 20 tiles).
export const EXPAND_MANPOWER_COST_ANCHORS: ReadonlyArray<readonly [frontierTiles: number, manpower: number]> = [
  [0, EXPAND_MANPOWER_COST],
  [100, 11],
  [150, 12],
  [175, 13],
  [200, 15],
  [1_000, 50],
  [2_000, 100]
];

const interpolate = (
  from: readonly [number, number],
  to: readonly [number, number],
  frontierTiles: number
): number => from[1] + ((frontierTiles - from[0]) * (to[1] - from[1])) / (to[0] - from[0]);

export const expandManpowerCostForFrontierCount = (frontierTileCount: number): number => {
  const anchors = EXPAND_MANPOWER_COST_ANCHORS;
  if (!Number.isFinite(frontierTileCount) || frontierTileCount <= 0) return EXPAND_MANPOWER_COST;
  for (let index = 1; index < anchors.length; index += 1) {
    const upper = anchors[index]!;
    if (frontierTileCount < upper[0]) return Math.floor(interpolate(anchors[index - 1]!, upper, frontierTileCount));
  }
  return Math.floor(interpolate(anchors[anchors.length - 2]!, anchors[anchors.length - 1]!, frontierTileCount));
};
