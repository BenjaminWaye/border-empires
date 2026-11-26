// Manpower a town adds per refill, for the Towns list: the town's own regen (tier, terrain, biota) under the focus
// chosen for it, the same figure the town screen's focus card shows for its active focus.
import { TOWN_FOCUS_MULTIPLIERS, biotaAdjustedTownManpower, manpowerPerBatch } from "@border-empires/shared";
import type { BiotaTownStatus } from "@border-empires/sim-protocol";
import { shownTownFocus } from "../client-town-focus/client-town-focus.js";
import { townTerrainForTile } from "../client-town-terrain-modifiers/client-town-tile-terrain.js";
import type { Tile } from "../client-types.js";

export const townManpowerPerRefill = (tile: Tile, biotaTowns: readonly BiotaTownStatus[] | undefined): number => {
  const town = tile.town;
  if (!town) return 0;
  const { terrainProfile, coastal } = townTerrainForTile(tile, town);
  const biota = biotaTowns?.find((entry) => entry.tileKey === `${tile.x},${tile.y}`);
  const { regenPerMinute } = biotaAdjustedTownManpower(town.populationTier, terrainProfile, coastal, biota);
  return manpowerPerBatch(regenPerMinute * TOWN_FOCUS_MULTIPLIERS[shownTownFocus(town)].manpowerRegen);
};
