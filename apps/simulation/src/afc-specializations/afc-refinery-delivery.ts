// AFC scarcity delivery for strategic resources (Phase 2 of
// docs/territory-development-plan.md): at most ONE finished refinery per
// delivery, for the best linked, unclaimed field of the resource (most
// garrisoned tiles, then nearest its town by land), on a free support tile of
// that town that passes the build command's placement checks
// (openTownSupportNeighborTiles, which applies landmarkConstructionBlocker,
// plus townSupportStructureShowsOnTile), assigned to that field.
import type { DomainTileState } from "@border-empires/game-domain";
import {
  REFINERY_FIELD_RESOURCE_BY_TYPE, REFINERY_TYPE_BY_RESOURCE, compareRefineryTiles, eligibleRefineryFields, isRefineryType,
  refineryFieldAt, takenRefineryFieldIds,
  type EconomicStructureType, type RefineryFieldResource
} from "@border-empires/shared";
import { assignedTownKeyForSupportTile, openTownSupportNeighborTiles, townSupportStructureShowsOnTile } from "../town-support-lookup.js";

const FIELD_RESOURCE_BY_SLOT: Record<"TITANIUM" | "CRYSTAL" | "UMBRITE", RefineryFieldResource> = { TITANIUM: "TITANIUM", CRYSTAL: "GEMS", UMBRITE: "UMBRITE" };

type RefineryDelivery = { key: string; type: EconomicStructureType; field: { x: number; y: number } };
type DeliveryPick = RefineryDelivery & { garrisoned: number; distance: number };

/** Better pick: more garrisoned field tiles, then nearer its town; ties keep the earlier (smaller town tile, then nearer field). */
const better = (a: DeliveryPick, b: DeliveryPick | undefined): boolean => !b || a.garrisoned > b.garrisoned || (a.garrisoned === b.garrisoned && a.distance < b.distance);

/** The single refinery delivery for `slotResource` (an empty list when no town links a free field with a placeable ring tile). */
export const refineryDeliveryCandidates = (
  tiles: ReadonlyMap<string, DomainTileState>, playerId: string, ownedTiles: readonly DomainTileState[],
  slotResource: "TITANIUM" | "CRYSTAL" | "UMBRITE", isLocked: (key: string) => boolean
): RefineryDelivery[] => {
  const type = REFINERY_TYPE_BY_RESOURCE[FIELD_RESOURCE_BY_SLOT[slotResource]];
  const resource = REFINERY_FIELD_RESOURCE_BY_TYPE[type];
  const taken = takenRefineryFieldIds(tiles, playerId, ownedTiles.filter((tile) => isRefineryType(tile.economicStructure?.type)),
    (ownerId, x, y) => assignedTownKeyForSupportTile(tiles, ownerId, x, y));
  const towns = ownedTiles
    .filter((tile) => tile.ownershipState === "SETTLED" && tile.town && tile.town.populationTier !== "SETTLEMENT")
    .sort(compareRefineryTiles);
  let best: DeliveryPick | undefined;
  for (const town of towns) {
    const townKey = `${town.x},${town.y}`;
    const fields = eligibleRefineryFields(tiles, playerId, type, townKey, taken).filter((field) => !field.taken);
    if (fields.length === 0) continue;
    const site = openTownSupportNeighborTiles(tiles, playerId, townKey)
      .filter((tile) => !isLocked(`${tile.x},${tile.y}`) && townSupportStructureShowsOnTile(tiles, playerId, tile, type))
      .sort(compareRefineryTiles)[0];
    if (!site) continue;
    for (const field of fields) {
      const garrisoned = refineryFieldAt(tiles, field.anchorX, field.anchorY, resource)!.tiles
        .filter((tile) => tile.ownerId === playerId && tile.ownershipState === "SETTLED").length;
      const pick: DeliveryPick = { key: `${site.x},${site.y}`, type, field: { x: field.anchorX, y: field.anchorY }, garrisoned, distance: field.distance };
      if (better(pick, best)) best = pick;
    }
  }
  return best ? [{ key: best.key, type: best.type, field: best.field }] : [];
};
