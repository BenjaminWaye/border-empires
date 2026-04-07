import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import { resourceIconForKey } from "./client-map-display.js";
import type { Tile, TileOverviewLine, TileUpkeepEntry } from "./client-types.js";

const upkeepResourceOrder = ["GOLD", "FOOD", "IRON", "SUPPLY", "CRYSTAL", "OIL"] as const;

const hasUpkeepAmount = (entry: TileUpkeepEntry): boolean =>
  upkeepResourceOrder.some((resource) => Number(entry.perMinute[resource] ?? 0) > 0.0001);

const fallbackUpkeepEntriesForTile = (tile: Tile): TileUpkeepEntry[] => {
  const entries: TileUpkeepEntry[] = [];
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number" && tile.town.foodUpkeepPerMinute > 0.0001) {
    entries.push({ label: "Town", perMinute: { FOOD: tile.town.foodUpkeepPerMinute } });
  }
  if (tile.observatory?.status === "active") {
    entries.push({ label: "Observatory", perMinute: { CRYSTAL: OBSERVATORY_UPKEEP_PER_MIN } });
  }
  return entries;
};

const formatUpkeepEntry = (entry: TileUpkeepEntry): string => {
  const parts = upkeepResourceOrder
    .map((resource) => {
      const amount = Number(entry.perMinute[resource] ?? 0);
      if (amount <= 0.0001) return undefined;
      return `${resourceIconForKey(resource)} ${amount.toFixed(2)}/m`;
    })
    .filter((part): part is string => Boolean(part));
  return parts.join(" · ");
};

export const tileOverviewUpkeepLines = (tile: Tile): TileOverviewLine[] => {
  const entries = (tile.upkeepEntries ?? fallbackUpkeepEntriesForTile(tile)).filter(hasUpkeepAmount);
  if (entries.length === 0) return [];
  return [{ html: "Upkeep", kind: "section" }, ...entries.map((entry) => ({ html: `${entry.label}: ${formatUpkeepEntry(entry)}` }))];
};
