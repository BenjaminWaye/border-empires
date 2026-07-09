import { type Terrain } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";

export type TileDeltaBatchTile = Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"][number];

export type ProtoSimulationEvent = {
  event_type: string;
  command_id: string;
  player_id: string;
  message_type?: string;
  action_type: string;
  origin_x: number;
  origin_y: number;
  target_x: number;
  target_y: number;
  resolves_at: number;
  code: string;
  message: string;
  attacker_won: boolean;
  manpower_delta?: number;
  pillaged_gold?: number;
  pillaged_strategic_json?: string;
  combat_result_json?: string;
  collect_mode?: string;
  gold?: number;
  strategic_json?: string;
  tiles?: number;
  collect_x?: number;
  collect_y?: number;
  payload_json?: string;
  tile_deltas: Array<{
    x: number;
    y: number;
    terrain?: string | undefined;
    resource?: string | undefined;
    dock_id?: string | undefined;
    owner_id?: string | undefined;
    ownership_state?: string | undefined;
    frontier_decay_at?: number | undefined;
    town_json?: string | undefined;
    town_type?: string | undefined;
    town_name?: string | undefined;
    town_population_tier?: string | undefined;
    fort_json?: string | undefined;
    observatory_json?: string | undefined;
    siege_outpost_json?: string | undefined;
    economic_structure_json?: string | undefined;
    sabotage_json?: string | undefined;
    shard_site_json?: string | undefined;
    muster_json?: string | undefined;
    visibility_state?: string | undefined;
  }>;
  tileDeltas?: Array<{
    x: number;
    y: number;
    terrain?: string | undefined;
    resource?: string | undefined;
    dockId?: string | undefined;
    ownerId?: string | null | undefined;
    ownershipState?: string | null | undefined;
    frontierDecayAt?: number | null | undefined;
    frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | null | undefined;
    townJson?: string | undefined;
    townType?: string | undefined;
    townName?: string | undefined;
    townPopulationTier?: string | undefined;
    fortJson?: string | undefined;
    observatoryJson?: string | undefined;
    siegeOutpostJson?: string | undefined;
    economicStructureJson?: string | undefined;
    sabotageJson?: string | undefined;
    shardSiteJson?: string | undefined;
    musterJson?: string | undefined;
    yield?: {
      gold?: number;
      strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    } | undefined;
    yieldRate?: {
      goldPerMinute?: number;
      strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>>;
    } | undefined;
    yieldCap?: { gold: number; strategicEach: number } | undefined;
    visibilityState?: string | undefined;
  }>;
  count?: number;
  cancelled_command_ids?: string[];
};

export type SimulationTileDelta = {
  x: number;
  y: number;
  terrain?: Terrain;
  resource?: string | undefined;
  dockId?: string | undefined;
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  frontierDecayAt?: number | undefined;
  frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
  townJson?: string | undefined;
  townType?: "MARKET" | "FARMING";
  townName?: string | undefined;
  townPopulationTier?: "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS";
  fortJson?: string | undefined;
  observatoryJson?: string | undefined;
  siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined;
  sabotageJson?: string | undefined;
  shardSiteJson?: string | undefined;
};

// Event types that exist purely for in-sim bookkeeping (replay anchors,
// snapshot reconstruction, etc.) and have no client-facing audience. Writing
// them to the gRPC stream wastes bandwidth and — because the gateway proto
// shape is flat — has historically tripped consumers into mis-tagging them
// as empty-code COMMAND_REJECTED. Filter them at the wire boundary so the
// gateway never sees them in the first place.
export const WIRE_INTERNAL_EVENT_TYPES: ReadonlySet<SimulationEvent["eventType"]> = new Set([
  "SETTLEMENT_STARTED",
  "TILE_YIELD_ANCHOR_UPDATED",
  "TILE_YIELD_ANCHOR_BATCH",
  "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED"
]);

export const isWireInternalEvent = (event: SimulationEvent): boolean =>
  WIRE_INTERNAL_EVENT_TYPES.has(event.eventType);

export const toProtoEvent = (value: SimulationEvent): ProtoSimulationEvent => ({
  event_type: value.eventType,
  command_id: value.commandId,
  player_id: value.playerId,
  ...("messageType" in value ? { message_type: value.messageType } : {}),
  action_type: "actionType" in value ? value.actionType : "",
  origin_x: "originX" in value ? value.originX : 0,
  origin_y: "originY" in value ? value.originY : 0,
  target_x: "targetX" in value ? value.targetX : 0,
  target_y: "targetY" in value ? value.targetY : 0,
  resolves_at: "resolvesAt" in value ? value.resolvesAt : 0,
  code: "code" in value ? value.code : "",
  message: "message" in value ? value.message : "",
  attacker_won: "attackerWon" in value ? value.attackerWon : false,
  ...("manpowerDelta" in value && typeof value.manpowerDelta === "number" ? { manpower_delta: value.manpowerDelta } : {}),
  ...("pillagedGold" in value && typeof value.pillagedGold === "number" ? { pillaged_gold: value.pillagedGold } : {}),
  ...("pillagedStrategic" in value && value.pillagedStrategic ? { pillaged_strategic_json: JSON.stringify(value.pillagedStrategic) } : {}),
  ...("combatResult" in value && value.combatResult ? { combat_result_json: JSON.stringify(value.combatResult) } : {}),
  ...(value.eventType === "COLLECT_RESULT"
    ? {
        collect_mode: value.mode,
        gold: value.gold,
        strategic_json: JSON.stringify(value.strategic),
        tiles: value.tiles,
        ...(typeof value.x === "number" ? { collect_x: value.x } : {}),
        ...(typeof value.y === "number" ? { collect_y: value.y } : {})
      }
    : {}),
  ...(value.eventType === "TECH_UPDATE" || value.eventType === "DOMAIN_UPDATE" || value.eventType === "PLAYER_MESSAGE"
    ? { payload_json: value.payloadJson }
    : {}),
  ...(value.eventType === "COMBAT_CANCELLED"
    ? {
        count: value.count,
        cancelled_command_ids: value.cancelledCommandIds ?? []
      }
    : {}),
  tile_deltas:
    value.eventType === "TILE_DELTA_BATCH"
      ? value.tileDeltas.map((tile: TileDeltaBatchTile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dock_id: tile.dockId } : {}),
          ...("ownerId" in tile ? { owner_id: tile.ownerId ?? "" } : {}),
          ...("ownershipState" in tile ? { ownership_state: tile.ownershipState ?? "" } : {}),
          ...("frontierDecayAt" in tile ? { frontier_decay_at: tile.frontierDecayAt ?? 0 } : {}),
          ...("frontierDecayKind" in tile ? { frontier_decay_kind: tile.frontierDecayKind ?? "" } : {}),
          ...(tile.townJson ? { town_json: tile.townJson } : {}),
          ...(tile.townType ? { town_type: tile.townType } : {}),
          ...(tile.townName ? { town_name: tile.townName } : {}),
          ...(tile.townPopulationTier ? { town_population_tier: tile.townPopulationTier } : {}),
          ...("fortJson" in tile ? { fort_json: tile.fortJson ?? "" } : {}),
          ...("observatoryJson" in tile ? { observatory_json: tile.observatoryJson ?? "" } : {}),
          ...("siegeOutpostJson" in tile ? { siege_outpost_json: tile.siegeOutpostJson ?? "" } : {}),
          ...("economicStructureJson" in tile ? { economic_structure_json: tile.economicStructureJson ?? "" } : {}),
          ...("sabotageJson" in tile ? { sabotage_json: tile.sabotageJson ?? "" } : {}),
          ...("shardSiteJson" in tile ? { shard_site_json: tile.shardSiteJson ?? "" } : {}),
          ...("musterJson" in tile ? { muster_json: tile.musterJson ?? "" } : {}),
          ...("visibilityState" in tile && tile.visibilityState ? { visibility_state: tile.visibilityState } : {}),
          ...("yield" in tile && tile.yield ? { yield_json: JSON.stringify(tile.yield) } : {}),
          ...("yieldRate" in tile && tile.yieldRate ? { yield_rate_json: JSON.stringify(tile.yieldRate) } : {}),
          ...("yieldCap" in tile && tile.yieldCap ? { yield_cap_json: JSON.stringify(tile.yieldCap) } : {})
        }))
      : [],
  ...(value.eventType === "TILE_DELTA_BATCH"
    ? {
        tile_delta_json: JSON.stringify(value.tileDeltas),
        tileDeltas: value.tileDeltas.map((tile: TileDeltaBatchTile) => ({
          x: tile.x,
          y: tile.y,
          ...(tile.terrain ? { terrain: tile.terrain } : {}),
          ...(tile.resource ? { resource: tile.resource } : {}),
          ...(tile.dockId ? { dockId: tile.dockId } : {}),
          ...("ownerId" in tile ? { ownerId: tile.ownerId ?? null } : {}),
          ...("ownershipState" in tile ? { ownershipState: tile.ownershipState ?? null } : {}),
          ...("frontierDecayAt" in tile ? { frontierDecayAt: tile.frontierDecayAt ?? null } : {}),
          ...("frontierDecayKind" in tile ? { frontierDecayKind: tile.frontierDecayKind ?? null } : {}),
          ...(tile.townJson ? { townJson: tile.townJson } : {}),
          ...(tile.townType ? { townType: tile.townType } : {}),
          ...(tile.townName ? { townName: tile.townName } : {}),
          ...(tile.townPopulationTier ? { townPopulationTier: tile.townPopulationTier } : {}),
          ...("fortJson" in tile ? { fortJson: tile.fortJson } : {}),
          ...("observatoryJson" in tile ? { observatoryJson: tile.observatoryJson } : {}),
          ...("siegeOutpostJson" in tile ? { siegeOutpostJson: tile.siegeOutpostJson } : {}),
          ...("economicStructureJson" in tile ? { economicStructureJson: tile.economicStructureJson } : {}),
          ...("sabotageJson" in tile ? { sabotageJson: tile.sabotageJson } : {}),
          ...("shardSiteJson" in tile ? { shardSiteJson: tile.shardSiteJson } : {}),
          ...("musterJson" in tile ? { musterJson: tile.musterJson } : {}),
          ...("visibilityState" in tile && tile.visibilityState ? { visibilityState: tile.visibilityState } : {}),
          ...("yield" in tile ? { yield: tile.yield } : {}),
          ...("yieldRate" in tile ? { yieldRate: tile.yieldRate } : {}),
          ...("yieldCap" in tile ? { yieldCap: tile.yieldCap } : {})
        }))
      }
    : {})
});

// Shared serializer for both SubscribePlayer and FetchTileDetail tile arrays.
// Both are full-snapshot paths (no clear-signaling semantics) so all structure
// fields use truthy guards — absent means not present, never "was removed".
// TILE_DELTA_BATCH uses toProtoEvent with `?? ""` clear-signaling for removals;
// keep the two serializers separate.
export const toFullSnapshotProtoTile = (tile: {
  x: number; y: number;
  terrain?: string | undefined; resource?: string | undefined; dockId?: string | undefined;
  ownerId?: string | undefined; ownershipState?: string | undefined;
  frontierDecayAt?: number | undefined; frontierDecayKind?: string | undefined;
  townJson?: string | undefined; townType?: string | undefined; townName?: string | undefined; townPopulationTier?: string | undefined;
  fortJson?: string | undefined; observatoryJson?: string | undefined; siegeOutpostJson?: string | undefined;
  economicStructureJson?: string | undefined; sabotageJson?: string | undefined; shardSiteJson?: string | undefined;
  musterJson?: string | undefined;
  yield?: unknown; yieldRate?: unknown; yieldCap?: unknown;
}) => ({
  x: tile.x,
  y: tile.y,
  ...(tile.terrain ? { terrain: tile.terrain } : {}),
  ...(tile.resource ? { resource: tile.resource } : {}),
  ...(tile.dockId ? { dock_id: tile.dockId } : {}),
  ...(tile.ownerId ? { owner_id: tile.ownerId } : {}),
  ...(tile.ownershipState ? { ownership_state: tile.ownershipState } : {}),
  ...(typeof tile.frontierDecayAt === "number" ? { frontier_decay_at: tile.frontierDecayAt } : {}),
  ...(tile.frontierDecayKind ? { frontier_decay_kind: tile.frontierDecayKind } : {}),
  ...(tile.townJson ? { town_json: tile.townJson } : {}),
  ...(tile.townType ? { town_type: tile.townType } : {}),
  ...(tile.townName ? { town_name: tile.townName } : {}),
  ...(tile.townPopulationTier ? { town_population_tier: tile.townPopulationTier } : {}),
  ...(tile.fortJson ? { fort_json: tile.fortJson } : {}),
  ...(tile.observatoryJson ? { observatory_json: tile.observatoryJson } : {}),
  ...(tile.siegeOutpostJson ? { siege_outpost_json: tile.siegeOutpostJson } : {}),
  ...(tile.economicStructureJson ? { economic_structure_json: tile.economicStructureJson } : {}),
  ...(tile.sabotageJson ? { sabotage_json: tile.sabotageJson } : {}),
  ...(tile.shardSiteJson ? { shard_site_json: tile.shardSiteJson } : {}),
  ...(tile.musterJson ? { muster_json: tile.musterJson } : {}),
  ...(tile.yield ? { yield_json: JSON.stringify(tile.yield) } : {}),
  ...(tile.yieldRate ? { yield_rate_json: JSON.stringify(tile.yieldRate) } : {}),
  ...(tile.yieldCap ? { yield_cap_json: JSON.stringify(tile.yieldCap) } : {})
});
