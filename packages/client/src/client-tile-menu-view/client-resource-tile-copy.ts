import { MANPOWER_REFILL_WINDOW_MS, BASE_SLOTS_BY_TILE_RESOURCE, RESOURCE_NETWORKS, isNetworkResource, isSiphonModeSabotage, type ResourceType } from "@border-empires/shared";
import type { TechInfo, Tile, TileOverviewLine } from "../client-types.js";

type BaseResource = Exclude<ResourceType, keyof typeof RESOURCE_NETWORKS>;
const isBaseResource = (value: string): value is BaseResource =>
  value === "FARM" || value === "FISH" || value === "TITANIUM" || value === "GEMS" || value === "UMBRITE";
const DEPOSIT_DESCRIPTIONS: Readonly<Record<BaseResource, string>> = {
  FARM: "Fertile grainland feeds towns, garrisons and industry.",
  FISH: "Coastal fishing grounds feed nearby land-based garrisons and industry.",
  TITANIUM: "Titanium ore supplies armour, construction and machinery.",
  GEMS: "Mineralised aether powers advanced industry and control systems.",
  UMBRITE: "Umbrite supplies military machinery and ammunition."
};
const escapeHtml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const card = (label: string, value: string, sub: string, wide = false): string =>
  `<div class="tile-stat${wide ? " tile-stat-span2" : ""}"><span class="tile-stat-label">${escapeHtml(label)}</span><span class="tile-stat-value">${escapeHtml(value)}</span><span class="tile-stat-sub">${escapeHtml(sub)}</span></div>`;

/** One sentence of public flavour; mechanics belong in the stat boxes. */
export function resourceTileDescriptionLines(tile: Tile): readonly string[] {
  const resource = tile.resource;
  if (!resource) return [];
  if (isNetworkResource(resource)) return [RESOURCE_NETWORKS[resource].description];
  return isBaseResource(resource) ? [DEPOSIT_DESCRIPTIONS[resource]] : [];
}

/** Public potential, never a claim that an undeveloped or foreign site is producing. */
export function resourceTileStatsHtml(tile: Tile, techCatalog: readonly Pick<TechInfo, "id" | "name">[] = []): string {
  const resource = tile.resource;
  if (!resource) return "";
  const siphoned = isSiphonModeSabotage(tile.sabotage) && tile.sabotage.ownerId !== tile.ownerId;
  if (!isNetworkResource(resource)) {
    if (!isBaseResource(resource)) return "";
    const slots = BASE_SLOTS_BY_TILE_RESOURCE[resource];
    if (!slots) return "";
    const label = slots.slotResource === "CRYSTAL" ? "Crystal" : slots.slotResource === "FOOD" ? "FOOD" : slots.slotResource === "TITANIUM" ? "Titanium" : "Umbrite";
    return `<div class="tile-stat-grid resource-stat-grid">${card("Base supply", `+${slots.baseSlots} ${label}`, "Renewable slots")}${card("Requires", "Garrison", siphoned ? "Siphoned" : "Owned tile")}</div>`;
  }
  const spec = RESOURCE_NETWORKS[resource];
  const structure = tile.economicStructure;
  const siteState = structure?.type !== spec.building ? "Build required"
    : structure.status === "under_construction" ? "Under construction"
    : structure.status !== "active" || structure.inactiveReason === "manual" ? "Inactive"
    : "Garrison + active site";
  const target = spec.target === "ANCILLARY_FACTORY" ? "Ancillary Factory" : spec.target === "TRADE_NEXUS" ? "Trade Nexus" : "Manufactory";
  const bonus = spec.batchBonus ? `+${spec.batchBonus * spec.slotsPerSite} Ancillaries` : `+${spec.creditPerDay} Coin`;
  const interval = spec.batchBonus ? `per ${MANPOWER_REFILL_WINDOW_MS / 3_600_000}h batch` : "per day";
  const unlock = techCatalog.find(tech => tech.id === spec.tech)?.name ?? "Matching Manifest";
  return `<div class="tile-stat-grid resource-stat-grid">${[
    card("Potential bonus", bonus, spec.slotsPerSite > 1 ? `${spec.slotsPerSite} factories × +${spec.batchBonus} · ${interval}` : `${interval} · 1 ${target}`),
    card("Supply", `${spec.slotsPerSite} exclusive slot${spec.slotsPerSite === 1 ? "" : "s"}`, siphoned ? "Siphoned" : "Renewable · tradeable"),
    card("Develop with", spec.buildingName, `${spec.manpowerCost} Ancillaries · ${siteState}`),
    card("Upkeep", "1 FOOD", "Powered site required"),
    card("Unlock", unlock, "Manifest required", true)
  ].join("")}</div>`;
}

export function resourceTileOverviewLines(tile: Tile, techCatalog: readonly Pick<TechInfo, "id" | "name">[] = []): TileOverviewLine[] {
  const descriptions = resourceTileDescriptionLines(tile);
  if (!descriptions.length) return [];
  return [...descriptions.map(html => ({ html })), { kind: "statgrid", html: resourceTileStatsHtml(tile, techCatalog) }];
}
