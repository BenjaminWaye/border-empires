import type { SimulationClientEvent } from "./sim-client.js";

// ProtoTileDelta and normalizeProtoTile extracted out of sim-client.ts (already
// well over the 500-line cap) to keep it from growing -- same pattern as
// sim-client-dock-normalize.ts's normalizeProtoDock.
export type ProtoTileDelta = {
  x: number;
  y: number;
  terrain?: string;
  resource?: string;
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
  frontier_decay_kind?: "ENCIRCLEMENT";
  frontierDecayKind?: "ENCIRCLEMENT";
  breach_shock_until?: number;
  breachShockUntil?: number;
  town_json?: string;
  townJson?: string;
  town_type?: string;
  townType?: string;
  town_name?: string;
  townName?: string;
  town_population_tier?: string;
  townPopulationTier?: string;
  fort_json?: string;
  fortJson?: string;
  observatory_json?: string;
  observatoryJson?: string;
  siege_outpost_json?: string;
  siegeOutpostJson?: string;
  economic_structure_json?: string;
  economicStructureJson?: string;
  sabotage_json?: string;
  sabotageJson?: string;
  shard_site_json?: string;
  shardSiteJson?: string; natural_wonder_json?: string; naturalWonderJson?: string;
  watchtower_json?: string;
  watchtowerJson?: string;
  muster_json?: string;
  musterJson?: string;
  visibility_state?: string;
  visibilityState?: string;
  ownership_clear_only?: boolean;
  ownershipClearOnly?: boolean;
  yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD", number>> };
  yieldCap?: { gold: number; strategicEach: number };
  yield_json?: string;
  yield_rate_json?: string;
  yield_cap_json?: string;
  combat_json?: string;
  combatJson?: string;
};

export const normalizeProtoTile = (tile: ProtoTileDelta): NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number] => {
  const normalized: NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number] = {
    x: tile.x,
    y: tile.y
  };
  if (tile.terrain === "LAND" || tile.terrain === "SEA" || tile.terrain === "COASTAL_SEA" || tile.terrain === "MOUNTAIN") normalized.terrain = tile.terrain;
  if (typeof tile.resource === "string" && tile.resource.length > 0) normalized.resource = tile.resource;
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
    normalized.frontierDecayKind = frontierDecayKind === "ENCIRCLEMENT" ? frontierDecayKind : undefined;
  }
  if ("breach_shock_until" in tile || "breachShockUntil" in tile) {
    const breachShockUntil = tile.breach_shock_until ?? tile.breachShockUntil;
    normalized.breachShockUntil = typeof breachShockUntil === "number" && breachShockUntil > 0 ? breachShockUntil : undefined;
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
  if ("fort_json" in tile || "fortJson" in tile) normalized.fortJson = tile.fort_json || tile.fortJson || undefined;
  if ("observatory_json" in tile || "observatoryJson" in tile) normalized.observatoryJson = tile.observatory_json || tile.observatoryJson || undefined;
  if ("siege_outpost_json" in tile || "siegeOutpostJson" in tile) normalized.siegeOutpostJson = tile.siege_outpost_json || tile.siegeOutpostJson || undefined;
  if ("economic_structure_json" in tile || "economicStructureJson" in tile) {
    normalized.economicStructureJson = tile.economic_structure_json || tile.economicStructureJson || undefined;
  }
  if ("sabotage_json" in tile || "sabotageJson" in tile) normalized.sabotageJson = tile.sabotage_json || tile.sabotageJson || undefined;
  if ("shard_site_json" in tile || "shardSiteJson" in tile) normalized.shardSiteJson = tile.shard_site_json || tile.shardSiteJson || undefined;
  if ("natural_wonder_json" in tile || "naturalWonderJson" in tile) normalized.naturalWonderJson = tile.natural_wonder_json || tile.naturalWonderJson || undefined; if ("watchtower_json" in tile || "watchtowerJson" in tile) normalized.watchtowerJson = tile.watchtower_json || tile.watchtowerJson || undefined;
  if ("muster_json" in tile || "musterJson" in tile) normalized.musterJson = tile.muster_json || tile.musterJson || undefined;
  const vs = tile.visibility_state || tile.visibilityState;
  if (vs === "VISIBLE" || vs === "FOG" || vs === "UNEXPLORED") normalized.visibilityState = vs;
  if (tile.ownership_clear_only === true || tile.ownershipClearOnly === true) normalized.ownershipClearOnly = true;
  if ("combat_json" in tile || "combatJson" in tile) normalized.combatJson = tile.combat_json || tile.combatJson || undefined;
  if ("yield" in tile && tile.yield && typeof tile.yield === "object") {
    normalized.yield = tile.yield as NonNullable<typeof normalized.yield>;
  } else if (typeof tile.yield_json === "string" && tile.yield_json.length > 0) {
    try { normalized.yield = JSON.parse(tile.yield_json) as NonNullable<typeof normalized.yield>; } catch { /* ignore */ }
  }
  if ("yieldRate" in tile && tile.yieldRate && typeof tile.yieldRate === "object") {
    normalized.yieldRate = tile.yieldRate as NonNullable<typeof normalized.yieldRate>;
  } else if (typeof tile.yield_rate_json === "string" && tile.yield_rate_json.length > 0) {
    try { normalized.yieldRate = JSON.parse(tile.yield_rate_json) as NonNullable<typeof normalized.yieldRate>; } catch { /* ignore */ }
  }
  if ("yieldCap" in tile && tile.yieldCap && typeof tile.yieldCap === "object") {
    normalized.yieldCap = tile.yieldCap as NonNullable<typeof normalized.yieldCap>;
  } else if (typeof tile.yield_cap_json === "string" && tile.yield_cap_json.length > 0) {
    try { normalized.yieldCap = JSON.parse(tile.yield_cap_json) as NonNullable<typeof normalized.yieldCap>; } catch { /* ignore */ }
  }
  return normalized;
};
