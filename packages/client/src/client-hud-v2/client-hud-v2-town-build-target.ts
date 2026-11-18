import { supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { Tile, TileActionDef } from "../client-types.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

/** Every open plot in the town's support ring that can take `action` now, in the ring's row order (no ranking). */
export const townPlotCandidates = (deps: Pick<HudV2Deps, "state" | "actionFlow">, town: Tile, action: TileActionDef["id"]): Tile[] => {
  const { state } = deps;
  const radius = supportRingRadiusForTier(town.town?.populationTier);
  return supportRingCandidates(state.tiles, town.x, town.y, radius).map(({ tile }) => tile).filter((tile) => {
    if (tile.ownerId !== state.me || tile.ownershipState !== "SETTLED" || tile.optimisticPending ||
        tile.town || tile.afc || tile.observatory || tile.siegeBattery || tile.economicStructure) return false;
    if (state.developmentQueue.some((entry) => entry.tileKey === `${tile.x},${tile.y}`)) return false;
    const assigned = assignedTownForSupportTile(state.tiles, tile, state.me);
    if (!assigned || assigned.x !== town.x || assigned.y !== town.y) return false;
    return deps.actionFlow.tileMenuViewForTile(tile).buildings.some((candidate) => candidate.id === action && !candidate.disabled);
  });
};

/** Resolve auto-placement before queueing, so each order reserves its own real support plot. */
export const townBuildTarget = (deps: Pick<HudV2Deps, "state" | "actionFlow">, town: Tile, action: TileActionDef["id"]): Tile | undefined =>
  townPlotCandidates(deps, town, action)[0];
