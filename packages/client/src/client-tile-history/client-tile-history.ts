import { PLANETARY_DEFENSE_DISPLAY_NAME, structureDisplayName } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { isPlanetaryDefenseOwnerId } from "../client-planetary-defense-style.js";

export const tileHistoryLines = (
  tile: Tile,
  deps: { me: string; playerNameForOwner: (ownerId?: string | null) => string | undefined }
): string[] => {
  const history = tile.history;
  if (!history) return [];
  const lines: string[] = [];
  const currentStructureType =
    tile.fort
      ? "FORT"
      : tile.siegeOutpost
        ? "SIEGE_OUTPOST"
        : tile.observatory
          ? "OBSERVATORY"
          : tile.economicStructure?.type;
  const shortOwnerHistoryLabel = (ownerId?: string | null): string => {
    if (!ownerId) return "Unknown";
    if (ownerId === deps.me) return "you";
    if (isPlanetaryDefenseOwnerId(ownerId)) return PLANETARY_DEFENSE_DISPLAY_NAME;
    return deps.playerNameForOwner(ownerId) ?? `Empire ${ownerId.slice(0, 8)}`;
  };
  if (history.captureCount > 0) lines.push(`Captured ${history.captureCount} time${history.captureCount === 1 ? "" : "s"}`);
  if (history.lastOwnerId) lines.push(`Last held by ${shortOwnerHistoryLabel(history.lastOwnerId)}`);
  if (history.wasMountainCreatedByPlayer) lines.push("Artificial mountain");
  if (history.wasMountainRemovedByPlayer) lines.push("Former mountain pass");
  if (history.lastStructureType && history.lastStructureType !== currentStructureType) {
    const label = `Former ${structureDisplayName(history.lastStructureType)} site`;
    lines.push(label);
  }
  return lines;
};
