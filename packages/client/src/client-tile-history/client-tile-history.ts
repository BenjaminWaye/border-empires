import type { Tile } from "../client-types.js";

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
    if (ownerId === "barbarian") return "Barbarians";
    return deps.playerNameForOwner(ownerId) ?? `Empire ${ownerId.slice(0, 8)}`;
  };
  if (history.captureCount > 0) lines.push(`Captured ${history.captureCount} time${history.captureCount === 1 ? "" : "s"}`);
  if (history.lastOwnerId) lines.push(`Last held by ${shortOwnerHistoryLabel(history.lastOwnerId)}`);
  if (history.wasMountainCreatedByPlayer) lines.push("Artificial mountain");
  if (history.wasMountainRemovedByPlayer) lines.push("Former mountain pass");
  if (history.lastStructureType && history.lastStructureType !== currentStructureType) {
    const label =
      history.lastStructureType === "FORT"
        ? "Former Fort site"
        : history.lastStructureType === "SIEGE_OUTPOST"
          ? "Former Siege Outpost site"
          : history.lastStructureType === "OBSERVATORY"
            ? "Former Observatory site"
            : history.lastStructureType === "FARMSTEAD"
              ? "Former Farmstead site"
              : history.lastStructureType === "UMBRITE_RIG"
                ? "Former Umbrite Rig site"
                : history.lastStructureType === "MINE"
                  ? "Former Mine site"
                  : history.lastStructureType === "MINTWORKS"
                    ? "Former Mintworks site"
                    : history.lastStructureType === "GRANARY"
                      ? "Former Granary site"
                      : history.lastStructureType === "AIRPORT"
                          ? "Former Airport site"
                          : history.lastStructureType === "UMBRITE_SYNTHESIZER"
                            ? "Former Umbrite Synthesizer site"
                            : history.lastStructureType === "ADVANCED_UMBRITE_SYNTHESIZER"
                              ? "Former Advanced Umbrite Synthesizer site"
                              : history.lastStructureType === "TITANIUM_WORKS"
                                ? "Former Titanium Works site"
                                : history.lastStructureType === "ADVANCED_TITANIUM_WORKS"
                                  ? "Former Advanced Titanium Works site"
                                  : history.lastStructureType === "CRYSTAL_SYNTHESIZER"
                                    ? "Former Aether Condenser site"
                                    : history.lastStructureType === "ADVANCED_CRYSTAL_SYNTHESIZER"
                                      ? "Former Advanced Aether Condenser site"
                                      : history.lastStructureType === "FOUNDRY"
                                        ? "Former Foundry site"
                                          : history.lastStructureType === "GOVERNORS_OFFICE"
                                            ? "Former Ministry Hall site"
                                            : "Former Radar System site";
    lines.push(label);
  }
  return lines;
};
