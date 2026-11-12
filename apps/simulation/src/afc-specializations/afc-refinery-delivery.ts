// AFC scarcity delivery for strategic resources (Phase 2 of
// docs/territory-development-plan.md): one finished refinery per linked,
// unclaimed field, each on a free support tile of an owned town and assigned
// with the same auto-pick as BUILD_ECONOMIC_STRUCTURE.
import type { DomainTileState } from "@border-empires/game-domain";
import {
  REFINERY_TYPE_BY_RESOURCE, chooseRefineryField, compareRefineryTiles, isRefineryType, takenRefineryFieldIds,
  type EconomicStructureType, type RefineryFieldResource
} from "@border-empires/shared";
import { openTownSupportNeighborTiles } from "../town-support-lookup.js";

const FIELD_RESOURCE_BY_SLOT: Record<"TITANIUM" | "CRYSTAL" | "UMBRITE", RefineryFieldResource> = { TITANIUM: "TITANIUM", CRYSTAL: "GEMS", UMBRITE: "UMBRITE" };

export const refineryDeliveryCandidates = (
  tiles: ReadonlyMap<string, DomainTileState>, playerId: string, ownedTiles: readonly DomainTileState[],
  slotResource: "TITANIUM" | "CRYSTAL" | "UMBRITE", isLocked: (key: string) => boolean
): Array<{ key: string; type: EconomicStructureType; field: { x: number; y: number } }> => {
  const type = REFINERY_TYPE_BY_RESOURCE[FIELD_RESOURCE_BY_SLOT[slotResource]];
  const taken = takenRefineryFieldIds(tiles, playerId, ownedTiles.filter((tile) => isRefineryType(tile.economicStructure?.type)));
  const towns = ownedTiles
    .filter((tile) => tile.ownershipState === "SETTLED" && tile.town && tile.town.populationTier !== "SETTLEMENT")
    .sort(compareRefineryTiles);
  const deliveries: Array<{ key: string; type: EconomicStructureType; field: { x: number; y: number } }> = [];
  for (const town of towns) {
    const townKey = `${town.x},${town.y}`;
    const open = openTownSupportNeighborTiles(tiles, playerId, townKey)
      .filter((tile) => !isLocked(`${tile.x},${tile.y}`))
      .sort(compareRefineryTiles);
    for (const site of open) {
      const choice = chooseRefineryField(tiles, playerId, type, townKey, taken);
      if (!choice.ok) break;
      taken.add(choice.fieldId);
      deliveries.push({ key: `${site.x},${site.y}`, type, field: { x: choice.x, y: choice.y } });
    }
  }
  return deliveries;
};
