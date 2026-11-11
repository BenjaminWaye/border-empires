// Open build slots per town for the town lists: how many of the town's
// support-ring tiles could take a new building right now. Mirrors the
// simulation's openTownSupportNeighborTiles (apps/simulation/src/
// town-support-lookup.ts), which is the exact set a support-ring build
// auto-places onto, so the count matches what the server would accept.
import { landmarkConstructionBlocker, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { Tile } from "../client-types.js";

/** Open support tiles for `town`, or undefined when the town cannot host support buildings yet (Settlement). */
export const openBuildSlotsForTown = (tiles: ReadonlyMap<string, Tile>, town: Tile, me: string): number | undefined => {
  const tier = town.town?.populationTier;
  if (!tier || tier === "SETTLEMENT") return undefined;
  let open = 0;
  for (const { tile } of supportRingCandidates(tiles, town.x, town.y, supportRingRadiusForTier(tier))) {
    if (tile.ownerId !== me || tile.ownershipState !== "SETTLED") continue;
    if (tile.town || tile.fort || tile.observatory || tile.siegeBattery || tile.economicStructure) continue;
    if (landmarkConstructionBlocker(tiles, tile.x, tile.y)) continue;
    const assigned = assignedTownForSupportTile(tiles, tile, me);
    if (assigned?.x === town.x && assigned.y === town.y) open += 1;
  }
  return open;
};
