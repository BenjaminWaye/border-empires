import { structureSlotRequirements, type SlotResource, type SlotStructureType } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

// §14.2: dormant/unpowered structure indicator. slotStructureTypeForField
// mirrors Runtime.isStructureDormant's own field->slot-type mapping
// (apps/simulation/src/runtime/runtime.ts) so the client and server can
// never disagree on which structure a dormancy key refers to.
export type DormancyField = "fort" | "observatory" | "siegeOutpost" | "economicStructure";

const slotStructureTypeForField = (tile: Tile, field: DormancyField): SlotStructureType | undefined => {
  if (field === "fort" && tile.fort) return (tile.fort.variant ?? "FORT") as SlotStructureType;
  if (field === "observatory" && tile.observatory) return "OBSERVATORY";
  if (field === "siegeOutpost" && tile.siegeOutpost) return (tile.siegeOutpost.variant ?? "SIEGE_OUTPOST") as SlotStructureType;
  if (field === "economicStructure" && tile.economicStructure) return tile.economicStructure.type as SlotStructureType;
  return undefined;
};

const SLOT_RESOURCE_TILE_HINT: Record<SlotResource, string> = {
  FOOD: "a Farm or Fish tile",
  TITANIUM: "a Titanium tile",
  CRYSTAL: "a Crystal tile",
  UMBRITE: "an Umbrite tile"
};

export const dormantStructureLineHtml = (
  tile: Tile,
  field: DormancyField,
  dormantResources: SlotResource[] | undefined,
  // Observatory upkeep is progressive (1st=1, 2nd=2, 3rd=3 CRYSTAL slots,
  // observatoryCrystalSlotCostForOwnedCount) -- structureSlotRequirements("OBSERVATORY")
  // alone is always flat 1, which understates a 2nd+ Observatory's real
  // requirement. Callers with tile/player context pass this tile's actual
  // current count (client-tile-action-support.ts's observatoryTileRank);
  // omitted, this falls back to the flat 1.
  observatoryCrystalSlotCount?: number
): string | undefined => {
  if (!dormantResources || dormantResources.length === 0) return undefined;
  const slotType = slotStructureTypeForField(tile, field);
  if (!slotType) return undefined;
  const needed = structureSlotRequirements(slotType)
    .filter((req) => dormantResources.includes(req.resource))
    .map((req) =>
      field === "observatory" && req.resource === "CRYSTAL" && observatoryCrystalSlotCount !== undefined
        ? { ...req, count: observatoryCrystalSlotCount }
        : req
    );
  if (needed.length === 0) return undefined;
  const parts = needed.map(
    (req) => `${req.count} ${req.resource === "FOOD" ? "Food" : req.resource === "TITANIUM" ? "Titanium" : req.resource === "CRYSTAL" ? "Crystal" : "Umbrite"} slot${req.count === 1 ? "" : "s"} (settle or capture ${SLOT_RESOURCE_TILE_HINT[req.resource]})`
  );
  return `<span class="tile-overview-dormant">⚠ Dormant — no free resource slot. Needs ${parts.join(" and ")}.</span>`;
};
