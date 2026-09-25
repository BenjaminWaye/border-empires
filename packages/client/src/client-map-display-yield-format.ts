// Resource/yield/upkeep formatting helpers, extracted from
// client-map-display.ts (500-line source budget, see AGENTS.md) to make
// room for the Manifest tree naming/lore pass's Ancillary Depot/Reserve
// Lattice structure additions without growing that already-oversized file
// further. Self-contained: operates on Tile and plain resource strings,
// with no dependency on client-map-display.ts's StructureInfoKey closures.

import { OBSERVATORY_UPKEEP_PER_MIN } from "@border-empires/shared";
import type { Tile } from "./client-types.js";

export const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "FISH") return "#6ec9ff";
  if (resource === "UMBRITE") return "#4d2a86";
  if (resource === "TITANIUM") return "#c9c9c9";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};

export const resourceLabel = (resource: string | undefined): string => {
  if (resource === "FARM") return "GRAIN";
  if (resource === "UMBRITE") return "UMBRITE";
  if (resource === "FISH") return "FISH";
  if (resource === "TITANIUM") return "TITANIUM";
  if (resource === "GEMS") return "GEMS";
  return resource ?? "";
};

export const resourceIconForKey = (resource: string): string => {
  if (resource === "GOLD") return "◉";
  if (resource === "FOOD") return "🍞";
  if (resource === "TITANIUM") return "⛏";
  if (resource === "CRYSTAL") return "💎";
  if (resource === "UMBRITE") return "🟣";
  if (resource === "SHARD") return "✦";
  return "•";
};

export const strategicResourceKeyForTile = (tile: Tile): "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | undefined => {
  if (tile.resource === "FARM" || tile.resource === "FISH") return "FOOD";
  if (tile.resource === "TITANIUM") return "TITANIUM";
  if (tile.resource === "GEMS") return "CRYSTAL";
  if (tile.resource === "UMBRITE") return "UMBRITE";
  return undefined;
};

export const tileProductionHtml = (tile: Tile): string => {
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, value]) => Number(value) > 0)
    .map(([resource, value]) => `${resourceIconForKey(resource)} ${Number(value).toFixed(1)}/day`);
  const gpd = (tile.yieldRate?.goldPerMinute ?? 0) * 1440;
  const parts: string[] = [];
  if (tile.town || gpd > 0) parts.push(`${resourceIconForKey("GOLD")} ${gpd.toFixed(1)}/day`);
  parts.push(...prodStrategic);
  return parts.join(" · ");
};

export const tileUpkeepHtml = (tile: Tile): string => {
  const upkeepFromEntries = { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 };
  for (const entry of tile.upkeepEntries ?? []) {
    upkeepFromEntries.food += Number(entry.perMinute.FOOD ?? 0);
    upkeepFromEntries.titanium += Number(entry.perMinute.TITANIUM ?? 0);
    upkeepFromEntries.umbrite += Number(entry.perMinute.UMBRITE ?? 0);
    upkeepFromEntries.crystal += Number(entry.perMinute.CRYSTAL ?? 0);
    upkeepFromEntries.gold += Number(entry.perMinute.GOLD ?? 0);
  }
  const parts: string[] = [];
  if (upkeepFromEntries.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${(upkeepFromEntries.food * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.titanium > 0.001) parts.push(`${resourceIconForKey("TITANIUM")} ${(upkeepFromEntries.titanium * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.umbrite > 0.001) parts.push(`${resourceIconForKey("UMBRITE")} ${(upkeepFromEntries.umbrite * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${(upkeepFromEntries.crystal * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${(upkeepFromEntries.gold * 1440).toFixed(1)}/day`);
  if (parts.length > 0) return parts.join(" · ");
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number") parts.push(`${resourceIconForKey("FOOD")} ${(tile.town.foodUpkeepPerMinute * 1440).toFixed(1)}/day`);
  if (tile.observatory?.status === "active") parts.push(`${resourceIconForKey("CRYSTAL")} ${(OBSERVATORY_UPKEEP_PER_MIN * 1440).toFixed(1)}/day`);
  return parts.join(" · ");
};

export const storedYieldSummary = (tile: Tile, options?: { alwaysShowOwnedTownGold?: boolean }): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = tile.yieldCap?.gold ?? 0;
  const canStoreGold = Boolean(tile.town || tile.dockId || (tile.yieldRate?.goldPerMinute ?? 0) > 0.01 || gold > 0.01);
  const alwaysShowOwnedTownGold = options?.alwaysShowOwnedTownGold === true;
  if (canStoreGold && (gold > 0.01 || goldCap > 0 || alwaysShowOwnedTownGold)) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${goldCap.toFixed(0)}`);
  }
  const strategicCap = tile.yieldCap?.strategicEach ?? 0;
  const strategicEntries = new Map<string, number>(
    Object.entries(tile.yield?.strategic ?? {}).map(([resource, value]) => [resource, Number(value)])
  );
  const primaryStrategic = strategicResourceKeyForTile(tile);
  if (primaryStrategic && strategicCap > 0 && !strategicEntries.has(primaryStrategic)) strategicEntries.set(primaryStrategic, 0);
  for (const [resource, value] of strategicEntries) {
    if (Number(value) <= 0.01 && strategicCap <= 0) continue;
    parts.push(`${resourceIconForKey(resource)} ${Number(value).toFixed(2)} / ${strategicCap.toFixed(1)}`);
  }
  return parts.join(" · ");
};

const yieldCapForResource = (tile: Tile, resource: string): number | undefined => {
  if (!tile.yieldCap) return undefined;
  if (resource === "GOLD") return tile.yieldCap.gold;
  if (resource === "FOOD" || resource === "TITANIUM" || resource === "CRYSTAL" || resource === "UMBRITE" || resource === "SHARD") {
    return tile.yieldCap.strategicEach;
  }
  return undefined;
};

export const formatYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = yieldCapForResource(tile, "GOLD");
  if (gold > 0.01 || (goldCap ?? 0) > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${(goldCap ?? 0).toFixed(1)}`);
  }
  for (const key of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = Number(tile.yield?.strategic?.[key] ?? 0);
    const cap = yieldCapForResource(tile, key);
    if (amount <= 0.01 && (cap ?? 0) <= 0) continue;
    parts.push(`${resourceIconForKey(key)} ${amount.toFixed(1)} / ${(cap ?? 0).toFixed(1)}`);
  }
  return parts.length > 0 ? `Yield: ${parts.join("  ")}` : "";
};

export const formatUpkeepSummary = (upkeep: { food: number; titanium: number; umbrite: number; crystal: number; gold: number }): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${(upkeep.food * 1440).toFixed(1)}/day`);
  if (upkeep.titanium > 0.001) parts.push(`${resourceIconForKey("TITANIUM")} ${(upkeep.titanium * 1440).toFixed(1)}/day`);
  if (upkeep.umbrite > 0.001) parts.push(`${resourceIconForKey("UMBRITE")} ${(upkeep.umbrite * 1440).toFixed(1)}/day`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${(upkeep.crystal * 1440).toFixed(1)}/day`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${(upkeep.gold * 1440).toFixed(1)}/day`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};
