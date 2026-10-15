import type { FrontierDecayKind, Terrain, VisibilityState } from "@border-empires/shared";
import { TILE_OVERLAY_WIRE_FIELDS, type TileOverlayJsonField, type TileOverlayJsonFields, type TileOverlayProtoField } from "@border-empires/sim-protocol";
import type { SimulationClientEvent } from "./sim-client.js";

// Extracted out of sim-client.ts's own SimulationClientEvent union (already
// well over the 500-line cap and may not grow) -- same extraction pattern as
// ProtoTileDelta/normalizeProtoTile below. Overlay fields (fortJson,
// musterJson, ...) come from TILE_OVERLAY_WIRE_FIELDS in sim-protocol, so a
// new overlay needs no edit here.
export type SimClientTileDelta = {
  x: number;
  y: number;
  terrain?: Terrain;
  resource?: string | undefined;
  prospectSignature?: "BLACKWOOD_CANOPY" | "FERROUS_DUST" | "REFRACTIVE_GROUND";
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  reachOwnerId?: string | undefined;
  frontierDecayAt?: number | undefined;
  frontierDecayKind?: FrontierDecayKind | undefined;
  breachShockUntil?: number | undefined;
  captureHoldUntil?: number | undefined;
  townJson?: string | undefined;
  townType?: "MARKET" | "FARMING";
  townName?: string | undefined;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  visibilityState?: VisibilityState | undefined;
  yieldRate?: { goldPerMinute?: number } | undefined;
  ownershipClearOnly?: boolean;
  combatJson?: string | undefined;
} & TileOverlayJsonFields;

// ProtoTileDelta and normalizeProtoTile extracted out of sim-client.ts (already
// well over the 500-line cap) to keep it from growing -- same pattern as
// sim-client-dock-normalize.ts's normalizeProtoDock.
export type ProtoTileDelta = {
  x: number;
  y: number;
  terrain?: string;
  resource?: string;
  prospect_signature?: string;
  prospectSignature?: string;
  dock_id?: string;
  dockId?: string;
  owner_id?: string;
  ownerId?: string;
  ownership_state?: string;
  ownershipState?: string;
  reach_owner_id?: string;
  reachOwnerId?: string;
  frontier_decay_at?: number;
  frontierDecayAt?: number;
  frontier_decay_kind?: FrontierDecayKind;
  frontierDecayKind?: FrontierDecayKind;
  breach_shock_until?: number;
  breachShockUntil?: number;
  capture_hold_until?: number;
  captureHoldUntil?: number;
  town_json?: string;
  townJson?: string;
  town_type?: string;
  townType?: string;
  town_name?: string;
  townName?: string;
  town_population_tier?: string;
  townPopulationTier?: string;
  visibility_state?: string;
  visibilityState?: string;
  ownership_clear_only?: boolean;
  ownershipClearOnly?: boolean;
  yieldRate?: { goldPerMinute?: number };
  yield_rate_json?: string;
  combat_json?: string;
  combatJson?: string;
} & { [F in TileOverlayProtoField | TileOverlayJsonField]?: string };

export const normalizeProtoTile = (tile: ProtoTileDelta): NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number] => {
  const normalized: NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number] = {
    x: tile.x,
    y: tile.y
  };
  if (tile.terrain === "LAND" || tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA" || tile.terrain === "MOUNTAIN") normalized.terrain = tile.terrain;
  if (typeof tile.resource === "string" && tile.resource.length > 0) normalized.resource = tile.resource;
  const prospectSignature = tile.prospect_signature ?? tile.prospectSignature;
  if (prospectSignature === "BLACKWOOD_CANOPY" || prospectSignature === "FERROUS_DUST" || prospectSignature === "REFRACTIVE_GROUND") {
    normalized.prospectSignature = prospectSignature;
  }
  if ("dock_id" in tile || "dockId" in tile) normalized.dockId = tile.dock_id || tile.dockId || undefined;
  if ("owner_id" in tile || "ownerId" in tile) normalized.ownerId = tile.owner_id || tile.ownerId || undefined;
  if ("ownership_state" in tile || "ownershipState" in tile) normalized.ownershipState = tile.ownership_state || tile.ownershipState || undefined;
  if ("reach_owner_id" in tile || "reachOwnerId" in tile) normalized.reachOwnerId = tile.reach_owner_id || tile.reachOwnerId || undefined;
  if ("frontier_decay_at" in tile || "frontierDecayAt" in tile) {
    const frontierDecayAt = tile.frontier_decay_at ?? tile.frontierDecayAt;
    normalized.frontierDecayAt = typeof frontierDecayAt === "number" && frontierDecayAt > 0 ? frontierDecayAt : undefined;
  }
  if ("frontier_decay_kind" in tile || "frontierDecayKind" in tile) {
    const frontierDecayKind = tile.frontier_decay_kind ?? tile.frontierDecayKind;
    normalized.frontierDecayKind =
      frontierDecayKind === "ENCIRCLEMENT" || frontierDecayKind === "OUT_OF_REACH" ? frontierDecayKind : undefined;
  }
  if ("breach_shock_until" in tile || "breachShockUntil" in tile) {
    const breachShockUntil = tile.breach_shock_until ?? tile.breachShockUntil;
    normalized.breachShockUntil = typeof breachShockUntil === "number" && breachShockUntil > 0 ? breachShockUntil : undefined;
  }
  if ("capture_hold_until" in tile || "captureHoldUntil" in tile) {
    const captureHoldUntil = tile.capture_hold_until ?? tile.captureHoldUntil;
    normalized.captureHoldUntil = typeof captureHoldUntil === "number" && captureHoldUntil > 0 ? captureHoldUntil : undefined;
  }
  if ("town_json" in tile || "townJson" in tile) normalized.townJson = tile.town_json || tile.townJson || undefined;
  if (typeof tile.town_type === "string" && (tile.town_type === "MARKET" || tile.town_type === "FARMING")) {
    normalized.townType = tile.town_type;
  } else if (typeof tile.townType === "string" && (tile.townType === "MARKET" || tile.townType === "FARMING")) {
    normalized.townType = tile.townType;
  }
  if ("town_name" in tile || "townName" in tile) normalized.townName = tile.town_name || tile.townName || undefined;
  if (typeof tile.town_population_tier === "string") {
    normalized.townPopulationTier = tile.town_population_tier as "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  } else if (typeof tile.townPopulationTier === "string") {
    normalized.townPopulationTier = tile.townPopulationTier as "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  }
  for (const { snake, camel } of TILE_OVERLAY_WIRE_FIELDS) {
    if (snake in tile || camel in tile) normalized[camel] = tile[snake] || tile[camel] || undefined;
  }
  const vs = tile.visibility_state || tile.visibilityState;
  if (vs === "VISIBLE" || vs === "FOG" || vs === "UNEXPLORED") normalized.visibilityState = vs;
  if (tile.ownership_clear_only === true || tile.ownershipClearOnly === true) normalized.ownershipClearOnly = true;
  if ("combat_json" in tile || "combatJson" in tile) normalized.combatJson = tile.combat_json || tile.combatJson || undefined;
  if ("yieldRate" in tile && tile.yieldRate && typeof tile.yieldRate === "object") {
    normalized.yieldRate = tile.yieldRate as NonNullable<typeof normalized.yieldRate>;
  } else if (typeof tile.yield_rate_json === "string" && tile.yield_rate_json.length > 0) {
    try { normalized.yieldRate = JSON.parse(tile.yield_rate_json) as NonNullable<typeof normalized.yieldRate>; } catch { /* ignore */ }
  }
  return normalized;
};
