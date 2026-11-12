import {
  BASE_SLOTS_BY_TILE_RESOURCE, BIOTA_SLOTS_PER_SITE, RESOURCE_NETWORKS, SALVAGE_ARMS_BONUS_MAX, SALVAGE_ARMS_BONUS_PER_SITE, SALVAGE_LOADS_PER_SITE,
  frontierSiteCaptureValue, isNetworkResource, isSiphonModeSabotage, salvageLoadsRemaining,
  type NetworkResource, type ResourceType
} from "@border-empires/shared";
import type { Tile, TileOverviewLine } from "../client-types.js";
import { depositRefineryCardHtml, refineryTileOverviewLines } from "../client-refineries/refinery-tile-copy.js";

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
  LUXURY_BIOTA: "biota",
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
export function resourceTileStatsHtml(tile: Tile, view: FrontierSiteViewer = {}): string {
  const resource = tile.resource;
  if (!resource) return "";
  const siphoned = isSiphonModeSabotage(tile.sabotage) && tile.sabotage.ownerId !== tile.ownerId;
  if (!isNetworkResource(resource)) {
    if (!isBaseResource(resource)) return "";
    const slots = BASE_SLOTS_BY_TILE_RESOURCE[resource];
    if (!slots) return "";
    const label = slots.slotResource === "CRYSTAL" ? "Crystal" : slots.slotResource === "FOOD" ? "FOOD" : slots.slotResource === "TITANIUM" ? "Titanium" : "Umbrite";
    // Strategic deposits also say whether a town refinery processes them (client-refineries/refinery-tile-copy.ts).
    const refinery = view.tiles && view.me ? depositRefineryCardHtml({ tiles: view.tiles, tilesRevision: view.tilesRevision ?? 0, me: view.me }, tile) : "";
    return `<div class="tile-stat-grid resource-stat-grid">${card("Base supply", `+${slots.baseSlots} ${label}`, "Renewable slots")}${card("Requires", "Garrison", siphoned ? "Siphoned" : "Owned tile")}${refinery}</div>`;
  }
  const spec = RESOURCE_NETWORKS[resource];
  const installation = `<button type="button" class="inline-info-link" data-structure-info="${escapeHtml(spec.building)}" aria-label="About ${escapeHtml(spec.buildingName)}">${escapeHtml(spec.buildingName)}</button>`;
  const effectCard = `<div class="tile-stat"><span class="tile-stat-label">After development</span><span class="tile-stat-value">${escapeHtml(spec.effect)}</span><span class="tile-stat-sub">${siphoned ? "Siphoned · " : ""}Requires ${installation}</span></div>`;
  const value = frontierSiteValueForViewer(tile, resource, view);
  const works = tile.economicStructure?.type === spec.building ? tile.economicStructure : undefined;
  const loadsCard = resource === "PRECURSOR_SALVAGE" && works
    ? card("Loads left", `${salvageLoadsRemaining(works)} of ${SALVAGE_LOADS_PER_SITE}`, "Each load can go to the Court") : "";
  return `<div class="tile-stat-grid resource-stat-grid">${effectCard}${value ? card(value.label, value.value, value.sub) : ""}${loadsCard}</div>`;
}

/** Who is looking and which frontier sites they already hold (after trades), so a deposit can show its value to them. */
export type FrontierSiteViewer = {
  readonly me?: string | undefined;
  readonly held?: Readonly<Record<NetworkResource, number>> | undefined;
  /** The viewer's known tiles, for the refinery copy on deposits and refineries. */
  readonly tiles?: ReadonlyMap<string, Tile> | undefined;
  readonly tilesRevision?: number | undefined;
};

/** What capturing this site adds for the viewer, or what losing it costs if it is already theirs and working. */
const frontierSiteValueForViewer = (tile: Tile, resource: NetworkResource, view: FrontierSiteViewer): { label: string; value: string; sub: string } | undefined => {
  if (!view.me || !view.held) return undefined;
  const held = view.held[resource] ?? 0;
  const spec = RESOURCE_NETWORKS[resource];
  const working = tile.ownerId === view.me && tile.economicStructure?.type === spec.building && tile.economicStructure.status === "active";
  const name = NETWORK_SUPPLY_NAMES[resource];
  if (working) {
    const others = Math.max(0, held - 1);
    const loss = resource === "LUXURY_BIOTA" ? `−${BIOTA_SLOTS_PER_SITE} biota slots`
      : others >= SALVAGE_ARMS_BONUS_MAX / SALVAGE_ARMS_BONUS_PER_SITE ? "No change (bonus at +10%)" : "−1% attack and defense";
    return { label: "If you lose it", value: loss, sub: `You hold ${held} ${name} ${held === 1 ? "site" : "sites"}` };
  }
  return { label: "Capturing it adds", value: frontierSiteCaptureValue(resource, held), sub: `You hold ${held} ${name} ${held === 1 ? "site" : "sites"}` };
};

export function resourceTileOverviewLines(tile: Tile, view: FrontierSiteViewer = {}): TileOverviewLine[] {
  const refinery = view.tiles && view.me ? refineryTileOverviewLines({ tiles: view.tiles, tilesRevision: view.tilesRevision ?? 0, me: view.me }, tile) : [];
  const descriptions = resourceTileDescriptionLines(tile);
  if (!descriptions.length) return refinery;
  return [...refinery, ...descriptions.map(html => ({ html })), { kind: "statgrid", html: resourceTileStatsHtml(tile, view) }];
}
