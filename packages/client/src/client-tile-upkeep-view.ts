import { structureSlotRequirements, SYNTHESIZER_STRUCTURE_TYPES, converterModeOf, type BuildableStructureType, type SlotStructureType } from "@border-empires/shared";
import { economicStructureName, resourceIconForKey } from "./client-map-display.js";
import type { Tile, TileOverviewLine, TileUpkeepEntry } from "./client-types.js";

const upkeepResourceOrder = ["GOLD", "FOOD", "TITANIUM", "UMBRITE", "CRYSTAL"] as const;

const hasUpkeepAmount = (entry: TileUpkeepEntry): boolean =>
  Boolean(entry.slot && entry.slot.count > 0) ||
  upkeepResourceOrder.some((resource) => Number(entry.perMinute[resource] ?? 0) > 0.0001);

// §12.1 (docs/manpower-economy-rewrite-plan.md): Observatory's CRYSTAL
// slot occupation is its upkeep now — no separate per-minute drain left
// to show here.
const fallbackUpkeepEntriesForTile = (tile: Tile): TileUpkeepEntry[] => {
  const entries: TileUpkeepEntry[] = [];
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number" && tile.town.foodUpkeepPerMinute > 0.0001) {
    entries.push({ label: "Town", perMinute: { FOOD: tile.town.foodUpkeepPerMinute } });
  }
  return entries;
};

const formatUpkeepEntry = (entry: TileUpkeepEntry): string => {
  const parts = upkeepResourceOrder
    .map((resource) => {
      const amount = Number(entry.perMinute[resource] ?? 0) * 1440;
      if (amount <= 0.01) return undefined;
      return `${resourceIconForKey(resource)} ${amount.toFixed(1)}/day`;
    })
    .filter((part): part is string => Boolean(part));
  if (entry.slot && entry.slot.count > 0) {
    parts.push(`${entry.slot.count} ${entry.slot.resource} slot${entry.slot.count === 1 ? "" : "s"}`);
  }
  return parts.join(" · ");
};

// §12.1: every fort/siege/economic structure's real upkeep is its
// resource-slot occupation (structure-slots.ts), not a continuous
// per-minute drain — show "N <resource> slot(s)" per active structure on
// this tile instead of a fabricated /day rate. Synthesizers are exempt
// while in Refine (SYNTHESIZE) mode (they provide a slot, never consume
// one); an EXCHANGE-mode converter sells off its family slot and does
// occupy it, so its slot must show.
const slotLinesForTile = (tile: Tile): TileOverviewLine[] => {
  const lines: TileOverviewLine[] = [];
  const pushSlotLines = (label: string, structureType: SlotStructureType, mode?: "SYNTHESIZE" | "EXCHANGE"): void => {
    if (SYNTHESIZER_STRUCTURE_TYPES.includes(structureType as BuildableStructureType) && converterModeOf({ converterMode: mode }) !== "EXCHANGE") return;
    for (const requirement of structureSlotRequirements(structureType)) {
      lines.push({ html: `${label}: ${requirement.count} ${requirement.resource} slot${requirement.count === 1 ? "" : "s"}` });
    }
  };
  if (tile.fort && tile.fort.status === "active") pushSlotLines("Fort", tile.fort.variant ?? "FORT");
  if (tile.siegeOutpost && tile.siegeOutpost.status === "active") {
    pushSlotLines("Siege Outpost", tile.siegeOutpost.variant ?? "SIEGE_OUTPOST");
  }
  if (tile.economicStructure && tile.economicStructure.status === "active") {
    pushSlotLines(economicStructureName(tile.economicStructure.type), tile.economicStructure.type, converterModeOf(tile.economicStructure));
  }
  return lines;
};

export const tileOverviewUpkeepLines = (tile: Tile): TileOverviewLine[] => {
  const entries = (tile.upkeepEntries ?? fallbackUpkeepEntriesForTile(tile)).filter(hasUpkeepAmount);
  const lines: TileOverviewLine[] = [
    ...entries.map((entry) => ({ html: `${entry.label}: ${formatUpkeepEntry(entry)}` })),
    ...slotLinesForTile(tile),
  ];
  if (lines.length === 0) return [];
  return [{ html: "Upkeep", kind: "section" }, ...lines];
};
