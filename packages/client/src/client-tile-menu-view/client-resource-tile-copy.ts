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
const NETWORK_SUPPLY_NAMES = {
  NEURAL_RESIN: "resin",
  CONDUCTIVE_MINERALS: "conductive",
  CATALYTIC_DEPOSIT: "catalyst",
  LUXURY_BIOTA: "luxury",
  PRECURSOR_SALVAGE: "salvage"
} as const;
const escapeHtml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
const card = (label: string, value: string, sub: string): string =>
  `<div class="tile-stat"><span class="tile-stat-label">${escapeHtml(label)}</span><span class="tile-stat-value">${escapeHtml(value)}</span>${sub ? `<span class="tile-stat-sub">${escapeHtml(sub)}</span>` : ""}</div>`;

/** One sentence of public flavour; mechanics belong in the stat boxes. */
export function resourceTileDescriptionLines(tile: Tile): readonly string[] {
  const resource = tile.resource;
  if (!resource) return [];
  if (isNetworkResource(resource)) return [RESOURCE_NETWORKS[resource].description];
  return isBaseResource(resource) ? [DEPOSIT_DESCRIPTIONS[resource]] : [];
}

/** Public potential, never a claim that an undeveloped or foreign site is producing. */
export function resourceTileStatsHtml(tile: Tile, techCatalog: readonly Pick<TechInfo, "id" | "name">[] = [], techIds: readonly string[] = []): string {
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
  const target = spec.target === "ANCILLARY_DEPOT" ? "Ancillary Depot" : spec.target === "ANCILLARY_FACTORY" ? "Ancillary Factory" : spec.target === "TRADE_NEXUS" ? "Trade Nexus" : "Manufactory";
  const bonus = spec.batchBonus ? `+${spec.batchBonus} Ancillaries/${MANPOWER_REFILL_WINDOW_MS / 3_600_000}h` : `+${spec.creditPerDay} Coin/day`;
  const supply = NETWORK_SUPPLY_NAMES[resource];
  const recipient = spec.slotsPerSite > 1
    ? `each of ${spec.slotsPerSite} factories without ${supply} supply`
    : `${target} without ${supply} supply`;
  const installation = `<button type="button" class="inline-info-link" data-structure-info="${escapeHtml(spec.building)}" aria-label="About ${escapeHtml(spec.buildingName)}">${escapeHtml(spec.buildingName)}</button>`;
  const bonusCard = `<div class="tile-stat"><span class="tile-stat-label">After development</span><span class="tile-stat-value"><strong>${escapeHtml(bonus)} for </strong><span class="resource-bonus-recipient">${escapeHtml(recipient)}</span></span><span class="tile-stat-sub">${siphoned ? "Siphoned · " : ""}Requires ${installation}</span></div>`;
  const unlock = techCatalog.find(tech => tech.id === spec.tech)?.name ?? "View required technology";
  const researched = techIds.includes(spec.tech);
  const researchCard = `<div class="tile-stat"><span class="tile-stat-label">${researched ? "Researched" : "Research required"}</span><span class="tile-stat-value"><button type="button" class="inline-info-link resource-tech-link" data-view-tech="${escapeHtml(spec.tech)}" aria-label="Open ${escapeHtml(unlock)} in tech tree">${escapeHtml(unlock)}</button></span><span class="tile-stat-sub">View in tech tree →</span></div>`;
  return `<div class="tile-stat-grid resource-stat-grid">${[
    bonusCard,
    researchCard
  ].join("")}</div>`;
}

export function resourceTileOverviewLines(tile: Tile, techCatalog: readonly Pick<TechInfo, "id" | "name">[] = [], techIds: readonly string[] = []): TileOverviewLine[] {
  const descriptions = resourceTileDescriptionLines(tile);
  if (!descriptions.length) return [];
  return [...descriptions.map(html => ({ html })), { kind: "statgrid", html: resourceTileStatsHtml(tile, techCatalog, techIds) }];
}
