import { BASE_SLOTS_BY_TILE_RESOURCE, TILE_SLOT_BOOST_STRUCTURES, type SlotResource } from "@border-empires/shared";
import { resourceIconForKey } from "../client-map-display.js";
import type { Tile } from "../client-types.js";

const SLOT_RESOURCE_LABEL: Record<SlotResource, string> = {
  FOOD: "Food",
  TITANIUM: "Titanium",
  CRYSTAL: "Crystal",
  UMBRITE: "Umbrite"
};

// Settled resource tiles (Farm/Fish/Titanium/Gems/Umbrite) no longer have a
// per-day yield rate — FOOD/TITANIUM/CRYSTAL/UMBRITE all moved to the
// slot-supply model (structure-slots.ts §5). This mirrors the building
// "Production: <html>" line in client-tile-menu-view.ts using the tile's
// slot contribution instead of a day-rate, since that's the only real
// number a settled resource tile produces now.
export const resourceSlotProductionHtml = (tile: Tile): string => {
  const slotEntry = Object.entries(BASE_SLOTS_BY_TILE_RESOURCE).find(([resource]) => resource === tile.resource);
  const slotInfo = slotEntry?.[1];
  if (!slotInfo) return "";
  const boost = tile.economicStructure
    ? Object.entries(TILE_SLOT_BOOST_STRUCTURES).find(([type]) => type === tile.economicStructure?.type)?.[1] ?? 0
    : 0;
  const totalSlots = slotInfo.baseSlots + boost;
  const label: string = SLOT_RESOURCE_LABEL[slotInfo.slotResource];
  return `${resourceIconForKey(slotInfo.slotResource)} ${label} +${totalSlots}`;
};
