// Tile-menu copy for town refineries (docs/territory-development-plan.md,
// Phase 2, Client): on a strategic deposit, its base slot, that it is
// refinable and which refinery processes it; on a refinery, its field, how
// many tiles it processes and the slots they give; on a booster, what it adds.
// Numbers come from the shared constants and the client status
// (refinery-client-status.ts), never hand-written.
import {
  REFINERY_BOOSTER_TYPE_BY_RESOURCE, REFINERY_REACH_LAND_TILES, isRefineryBoosterType, isRefineryFieldResource, isRefineryType,
  refineryTileKey, structureDisplayName, supportRingCandidates, MAX_SUPPORT_RING_RADIUS, type RefineryBoosterType
} from "@border-empires/shared";
import type { Tile, TileOverviewLine } from "../client-types.js";
import { refineryStatusFor, type RefineryClientStatus } from "./refinery-client-status.js";
import { refineryPerTileSlots } from "./refinery-field-options.js";

export type RefineryCopyView = { readonly tiles: ReadonlyMap<string, Tile>; readonly tilesRevision: number; readonly me: string };

const escapeHtml = (value: string): string => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
export const refineryStatCard = (label: string, value: string, sub: string): string =>
  `<div class="tile-stat"><span class="tile-stat-label">${escapeHtml(label)}</span><span class="tile-stat-value">${escapeHtml(value)}</span>${sub ? `<span class="tile-stat-sub">${escapeHtml(sub)}</span>` : ""}</div>`;

/** Your refinery whose field holds this deposit tile (a bounded scan of where such a refinery can stand). */
export const refineryForDeposit = (view: RefineryCopyView, tile: Tile): RefineryClientStatus | undefined => {
  if (!isRefineryFieldResource(tile.resource)) return undefined;
  const key = refineryTileKey(tile.x, tile.y);
  for (const { tile: candidate } of supportRingCandidates(view.tiles, tile.x, tile.y, REFINERY_REACH_LAND_TILES * 2 + MAX_SUPPORT_RING_RADIUS)) {
    if (candidate.economicStructure?.ownerId !== view.me || !isRefineryType(candidate.economicStructure.type)) continue;
    const status = refineryStatusFor(view, candidate);
    if (status?.fieldTiles?.some(({ x, y }) => refineryTileKey(x, y) === key)) return status;
  }
  return undefined;
};

/** The deposit's refinery card: who processes it, or that a town refinery could. */
export const depositRefineryCardHtml = (view: RefineryCopyView, tile: Tile): string => {
  if (!isRefineryFieldResource(tile.resource)) return "";
  const status = tile.ownerId === view.me ? refineryForDeposit(view, tile) : undefined;
  const name = status ? `${structureDisplayName(status.type)} at (${status.x}, ${status.y})` : "";
  if (status?.working && status.processedTileKeys.includes(refineryTileKey(tile.x, tile.y))) {
    return refineryStatCard("Refined", `+${refineryPerTileSlots(status.boosted)} slots`, `Processed by your ${name}`);
  }
  if (status?.working) return refineryStatCard("Refinery", "Garrison to refine", `Your ${name} processes this field`);
  if (status) return refineryStatCard("Refinery", "Not processing", `Your ${name}: ${status.linked ? "not active yet" : "link broken"}`);
  return refineryStatCard("Refinable", `+${refineryPerTileSlots(false)} slots`,
    `Per garrisoned tile, with a town refinery within ${REFINERY_REACH_LAND_TILES} land tiles (+${refineryPerTileSlots(true)} with its booster)`);
};

const fieldValue = (status: RefineryClientStatus): string => status.anchor ? `(${status.anchor.x}, ${status.anchor.y})` : "None";

const refineryCards = (status: RefineryClientStatus, own: boolean): string => {
  if (!own) return refineryStatCard("Link", status.linked ? "Linked" : "Not linked", "Field details are private");
  const fieldSize = status.fieldTiles?.length ?? 0;
  const perTile = refineryPerTileSlots(status.boosted);
  const link = status.needsField === "UNLINKED" ? "Broken" : status.needsField ? "No field" : status.linked ? "Linked" : "—";
  return [
    refineryStatCard("Field", fieldValue(status), fieldSize ? `${fieldSize} tile${fieldSize === 1 ? "" : "s"}` : "Choose one: Change field"),
    refineryStatCard("Processed", `${status.processedTileKeys.length} tile${status.processedTileKeys.length === 1 ? "" : "s"}`, `Garrisoned field tiles · Link ${link}`),
    refineryStatCard("Slots", `+${status.processedTileKeys.length * perTile}`, `+${perTile} per processed tile${status.boosted ? " (boosted)" : ""}`)
  ].join("");
};

const BOOSTER_REFINERY: Readonly<Record<RefineryBoosterType, string>> = {
  TITANIUM_SMELTER: "TITANIUM_REFINERY", UMBRITE_DISTILLERY: "UMBRITE_REFINERY", CRYSTAL_CUTTER: "CRYSTAL_REFINERY"
};

/** Overview lines for a refinery or booster tile (empty for anything else). */
export const refineryTileOverviewLines = (view: RefineryCopyView, tile: Tile): TileOverviewLine[] => {
  const record = tile.economicStructure;
  if (!record) return [];
  if (isRefineryBoosterType(record.type)) {
    const refinery = structureDisplayName(BOOSTER_REFINERY[record.type] as Parameters<typeof structureDisplayName>[0]);
    return [{ html: `Each tile this town's ${escapeHtml(refinery)}s process gives +${refineryPerTileSlots(true)} slots instead of +${refineryPerTileSlots(false)}. One per town.` }];
  }
  const status = refineryStatusFor(view, tile);
  if (!status) return [];
  const booster = REFINERY_BOOSTER_TYPE_BY_RESOURCE[status.resource];
  const intro = `Processes one ${status.resource === "GEMS" ? "Gems" : status.resource.charAt(0) + status.resource.slice(1).toLowerCase()} field linked to its town by your land within ${REFINERY_REACH_LAND_TILES} land tiles: +${refineryPerTileSlots(false)} slots per garrisoned field tile, +${refineryPerTileSlots(true)} with a ${structureDisplayName(booster)}.`;
  return [{ html: escapeHtml(intro) }, { kind: "statgrid", html: `<div class="tile-stat-grid resource-stat-grid">${refineryCards(status, record.ownerId === view.me)}</div>` }];
};
