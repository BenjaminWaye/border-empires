// Single source of truth for how long an EXPAND (frontier claim) takes on a
// given tile. Previously reimplemented independently in four places (the
// waypoint planner, game-domain worldgen, the simulation's frontier-command
// handler, and the client) which had quietly drifted out of sync -- two of
// them applied only the forest multiplier and silently ignored the hills
// penalty. All four now delegate here.
import { FOREST_FRONTIER_CLAIM_MULT, FRONTIER_CLAIM_MS, HILLS_FRONTIER_CLAIM_PENALTY_MS } from "../config.js";
import { isForestTileAt } from "../forest-terrain/forest-terrain.js";
import { isHillsTileAt } from "../hills-terrain/hills-terrain.js";

/**
 * Total EXPAND claim duration for a target tile -- forest multiplies the
 * base by FOREST_FRONTIER_CLAIM_MULT, hills add a flat
 * HILLS_FRONTIER_CLAIM_PENALTY_MS (both currently net out to 1.5x the
 * base). Forest and hills are mutually exclusive (see isHillsTileAt), so
 * this never double-applies both. Pure function of terrain, so every
 * caller (lock creation, rush-buy pricing, AI/waypoint planning, worldgen,
 * and the client's optimistic/queued-progress UI) can independently
 * recompute the exact same value from a tile's coordinates rather than
 * needing to store it anywhere.
 */
export const frontierClaimDurationMsAt = (x: number, y: number): number =>
  (isForestTileAt(x, y) ? FRONTIER_CLAIM_MS * FOREST_FRONTIER_CLAIM_MULT : FRONTIER_CLAIM_MS) +
  (isHillsTileAt(x, y) ? HILLS_FRONTIER_CLAIM_PENALTY_MS : 0);
