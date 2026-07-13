import { fileURLToPath } from "node:url";

import { credentials, loadPackageDefinition, type ClientReadableStream } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import {
  SIMULATION_PROTO_PATH,
  type AdminPlayerRow,
  type CommandEnvelope,
  type CurrentSeasonSummary,
  type GetRecentCommandsResponse,
  type LockedFrontierCombatResult,
  type PlayerSubscriptionDock,
  type PlayerSubscriptionSnapshot,
  type SimulationSeasonState,
  type SeasonArchiveRow,
  type StrategicResourceKey
} from "@border-empires/sim-protocol";
import type { Terrain, VisibilityState } from "@border-empires/shared";

type ProtoAck = { ok: boolean };
type ProtoSubscriptionNamespaceAck = { ok: boolean; namespace?: string };
type ProtoSeasonSummaryAck = { ok: boolean; summary_json?: string; summaryJson?: string };
type ProtoSeasonArchivesAck = { ok: boolean; archives_json?: string; archivesJson?: string };
type ProtoAdminPlayersAck = { ok: boolean; players_json?: string; playersJson?: string };
type ProtoGetRecentCommandsAck = { ok: boolean; commands_json?: string; commandsJson?: string };
type ProtoStartNextSeasonAck = { ok: boolean; season_id?: string; seasonId?: string };
type ProtoSeedBarbariansAck = {
  ok: boolean;
  requested?: number;
  placed?: number;
  detail_json?: string;
  detailJson?: string;
};

export type SeedBarbariansResult = {
  requested: number;
  placed: number;
  detail: Record<string, unknown>;
};
type ProtoPreparePlayerAck = { ok: boolean; player_id?: string; playerId?: string; spawned?: boolean };
export type PreparePlayerRallyAnchor = { x: number; y: number; island?: string };
type ProtoTileDelta = {
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
  frontier_decay_at?: number;
  frontierDecayAt?: number;
  frontier_decay_kind?: "NATURAL" | "ENCIRCLEMENT";
  frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT";
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
  shardSiteJson?: string;
  muster_json?: string;
  musterJson?: string;
  visibility_state?: string;
  visibilityState?: string;
  ownership_clear_only?: boolean;
  ownershipClearOnly?: boolean;
  yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD", number>> };
  yieldCap?: { gold: number; strategicEach: number };
  yield_json?: string;
  yield_rate_json?: string;
  yield_cap_json?: string;
};
type ProtoDockRoute = {
  dock_id?: string;
  dockId?: string;
  tile_key?: string;
  tileKey?: string;
  paired_dock_id?: string;
  pairedDockId?: string;
  connected_dock_ids?: string[];
  connectedDockIds?: string[];
};

type ProtoSubscribePlayerAck = {
  ok: boolean;
  player_id?: string;
  playerId?: string;
  player_json?: string;
  playerJson?: string;
  world_status_json?: string;
  worldStatusJson?: string;
  season_json?: string;
  seasonJson?: string;
  docks?: ProtoDockRoute[];
  tiles?: ProtoTileDelta[];
  snapshot?: string;
  snapshot_json?: string;
  snapshotJson?: string;
};
type ProtoSubscribePlayerRequest = {
  player_id: string;
  subscription_json: string;
};
type ProtoFetchTileDetailRequest = {
  player_id: string;
  x: number;
  y: number;
  full_visibility?: boolean;
};
type ProtoFetchTileDetailAck = {
  ok: boolean;
  player_id?: string;
  playerId?: string;
  x?: number;
  y?: number;
  tiles?: ProtoTileDelta[];
  player_upkeep_json?: string;
  playerUpkeepJson?: string;
};
type ProtoUnsubscribePlayerRequest = {
  player_id: string;
  subscription_key?: string;
};
type ProtoSimulationEvent = {
  event_type: string;
  command_id: string;
  player_id: string;
  action_type: string;
  origin_x: number;
  origin_y: number;
  target_x: number;
  target_y: number;
  resolves_at: number;
  code: string;
  message: string;
  attacker_won: boolean;
  combat_result_json?: string;
  combatResultJson?: string;
  manpower_delta?: number;
  manpowerDelta?: number;
  pillaged_gold?: number;
  pillaged_strategic_json?: string;
  collect_mode?: string;
  gold?: number;
  strategic_json?: string;
  tiles?: number;
  collect_x?: number;
  collect_y?: number;
  payload_json?: string;
  message_type?: string;
  tile_delta_json: string;
  tileDeltaJson?: string;
  tile_deltas?: ProtoTileDelta[];
  count?: number;
  cancelled_command_ids?: string[];
  cancelledCommandIds?: string[];
};

type SimulationClientLike = {
  SubmitCommand: (request: Record<string, unknown>, callback: (error: Error | null, response: ProtoAck) => void) => void;
  PreparePlayer: (
    request: { player_id: string; rally_anchor_json?: string },
    callback: (error: Error | null, response: ProtoPreparePlayerAck) => void
  ) => void;
  SubscribePlayer: (
    request: ProtoSubscribePlayerRequest,
    callback: (error: Error | null, response: ProtoSubscribePlayerAck) => void
  ) => void;
  FetchTileDetail?: (
    request: ProtoFetchTileDetailRequest,
    callback: (error: Error | null, response: ProtoFetchTileDetailAck) => void
  ) => void;
  UnsubscribePlayer: (
    request: ProtoUnsubscribePlayerRequest,
    callback: (error: Error | null, response: ProtoAck) => void
  ) => void;
  GetSubscriptionNamespace?: (
    request: Record<string, unknown>,
    callback: (error: Error | null, response: ProtoSubscriptionNamespaceAck) => void
  ) => void;
  Ping: (request: Record<string, unknown>, callback: (error: Error | null, response: ProtoAck) => void) => void;
  GetCurrentSeasonSummary?: (
    request: Record<string, unknown>,
    callback: (error: Error | null, response: ProtoSeasonSummaryAck) => void
  ) => void;
  ListSeasonArchives?: (
    request: Record<string, unknown>,
    callback: (error: Error | null, response: ProtoSeasonArchivesAck) => void
  ) => void;
  GetAdminPlayers?: (
    request: Record<string, unknown>,
    callback: (error: Error | null, response: ProtoAdminPlayersAck) => void
  ) => void;
  StartNextSeason?: (
    request: { force?: boolean; imperial_ward_json?: string | undefined },
    callback: (error: Error | null, response: ProtoStartNextSeasonAck) => void
  ) => void;
  SeedBarbarians?: (
    request: { count?: number },
    callback: (error: Error | null, response: ProtoSeedBarbariansAck) => void
  ) => void;
  StreamEvents: (request: Record<string, unknown>) => ClientReadableStream<ProtoSimulationEvent>;
};

type SimulationEventStream = {
  on(event: "data", listener: (event: ProtoSimulationEvent) => void): SimulationEventStream;
  on(event: "error", listener: (error: Error) => void): SimulationEventStream;
  on(event: "end", listener: () => void): SimulationEventStream;
  cancel(): void;
};

const packageDefinition = loadSync(fileURLToPath(SIMULATION_PROTO_PATH), {
  keepCase: true,
  longs: Number,
  defaults: true,
  enums: String,
  oneofs: false
});

const proto = loadPackageDefinition(packageDefinition) as unknown as {
  border_empires: {
    simulation: {
      SimulationService: new (address: string, creds: ReturnType<typeof credentials.createInsecure>) => SimulationClientLike;
    };
  };
};

export type SimulationClientEvent =
  | {
      eventType: "COMMAND_ACCEPTED";
      commandId: string;
      playerId: string;
      actionType: string;
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      resolvesAt: number;
      combatResult?: LockedFrontierCombatResult;
    }
  | {
      eventType: "COMMAND_REJECTED";
      commandId: string;
      playerId: string;
      code: string;
      message: string;
    }
  | {
      eventType: "COMBAT_CANCELLED";
      commandId: string;
      playerId: string;
      count: number;
      cancelledCommandIds?: string[];
    }
  | {
      eventType: "COMBAT_RESOLVED";
      commandId: string;
      playerId: string;
      actionType: string;
      originX: number;
      originY: number;
      targetX: number;
      targetY: number;
      attackerWon: boolean;
      manpowerDelta?: number;
      pillagedGold?: number;
      pillagedStrategic?: Partial<Record<StrategicResourceKey, number>>;
      combatResult?: LockedFrontierCombatResult;
    }
  | {
      eventType: "TILE_DELTA_BATCH";
      commandId: string;
      playerId: string;
      tileDeltas: Array<{
        x: number;
        y: number;
        terrain?: Terrain;
        resource?: string | undefined;
        dockId?: string | undefined;
        ownerId?: string | undefined;
        ownershipState?: string | undefined;
        frontierDecayAt?: number | undefined;
        frontierDecayKind?: "NATURAL" | "ENCIRCLEMENT" | undefined;
        breachShockUntil?: number | undefined;
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
        musterJson?: string | undefined;
        visibilityState?: VisibilityState | undefined;
        yield?: { gold?: number; strategic?: Partial<Record<StrategicResourceKey, number>> } | undefined;
        yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<StrategicResourceKey, number>> } | undefined;
        yieldCap?: { gold: number; strategicEach: number } | undefined;
        ownershipClearOnly?: boolean;
      }>;
    }
  | {
      eventType: "COLLECT_RESULT";
      commandId: string;
      playerId: string;
      mode: "visible" | "tile";
      x?: number;
      y?: number;
      tiles: number;
      gold: number;
      strategic: Partial<Record<StrategicResourceKey, number>>;
    }
  | {
      eventType: "TECH_UPDATE";
      commandId: string;
      playerId: string;
      payload: Record<string, unknown>;
    }
  | {
      eventType: "DOMAIN_UPDATE";
      commandId: string;
      playerId: string;
      payload: Record<string, unknown>;
    }
  | {
      eventType: "PLAYER_MESSAGE";
      commandId: string;
      playerId: string;
      messageType: string;
      payload: Record<string, unknown>;
    };

const toProtoCommand = (command: CommandEnvelope): Record<string, unknown> => ({
  command_id: command.commandId,
  session_id: command.sessionId,
  player_id: command.playerId,
  client_seq: command.clientSeq,
  issued_at: command.issuedAt,
  type: command.type,
  payload_json: command.payloadJson
});

const normalizeProtoDock = (dock: ProtoDockRoute): PlayerSubscriptionDock | undefined => {
  const dockId = dock.dock_id || dock.dockId;
  const tileKey = dock.tile_key || dock.tileKey;
  const pairedDockId = dock.paired_dock_id || dock.pairedDockId;
  if (!dockId || !tileKey || !pairedDockId) return undefined;
  const connectedDockIds = dock.connected_dock_ids || dock.connectedDockIds;
  return {
    dockId,
    tileKey,
    pairedDockId,
    ...(connectedDockIds?.length ? { connectedDockIds: [...connectedDockIds] } : {})
  };
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
  if ("frontier_decay_at" in tile || "frontierDecayAt" in tile) {
    const frontierDecayAt = tile.frontier_decay_at ?? tile.frontierDecayAt;
    normalized.frontierDecayAt = typeof frontierDecayAt === "number" && frontierDecayAt > 0 ? frontierDecayAt : undefined;
  }
  if ("frontier_decay_kind" in tile || "frontierDecayKind" in tile) {
    const frontierDecayKind = tile.frontier_decay_kind ?? tile.frontierDecayKind;
    normalized.frontierDecayKind = frontierDecayKind === "NATURAL" || frontierDecayKind === "ENCIRCLEMENT" ? frontierDecayKind : undefined;
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
  if ("muster_json" in tile || "musterJson" in tile) normalized.musterJson = tile.muster_json || tile.musterJson || undefined;
  const vs = tile.visibility_state || tile.visibilityState;
  if (vs === "VISIBLE" || vs === "FOG" || vs === "UNEXPLORED") normalized.visibilityState = vs;
  if (tile.ownership_clear_only === true || tile.ownershipClearOnly === true) normalized.ownershipClearOnly = true;
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

const parseJsonTileDeltas = (json: string): Array<NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number]> => {
  if (!json) return [];
  const parsed = JSON.parse(json) as unknown;
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is ProtoTileDelta => Boolean(item) && typeof item === "object" && typeof (item as ProtoTileDelta).x === "number" && typeof (item as ProtoTileDelta).y === "number")
    .map((tile) => normalizeProtoTile(tile));
};

const parseLockedCombatResult = (json: string | undefined): LockedFrontierCombatResult | undefined => {
  if (!json) return undefined;
  try {
    return JSON.parse(json) as LockedFrontierCombatResult;
  } catch {
    return undefined;
  }
};

const fromProtoEvent = (event: ProtoSimulationEvent): SimulationClientEvent | undefined => {
  if (event.event_type === "COMMAND_ACCEPTED") {
    const combatResult = parseLockedCombatResult(event.combat_result_json || event.combatResultJson);
    return {
      eventType: "COMMAND_ACCEPTED",
      commandId: event.command_id,
      playerId: event.player_id,
      actionType: event.action_type,
      originX: event.origin_x,
      originY: event.origin_y,
      targetX: event.target_x,
      targetY: event.target_y,
      resolvesAt: event.resolves_at,
      ...(combatResult ? { combatResult } : {})
    };
  }
  if (event.event_type === "COMBAT_RESOLVED") {
    const combatResult = parseLockedCombatResult(event.combat_result_json || event.combatResultJson);
    return {
      eventType: "COMBAT_RESOLVED",
      commandId: event.command_id,
      playerId: event.player_id,
      actionType: event.action_type,
      originX: event.origin_x,
      originY: event.origin_y,
      targetX: event.target_x,
      targetY: event.target_y,
      attackerWon: event.attacker_won,
      ...(typeof event.manpower_delta === "number"
        ? { manpowerDelta: event.manpower_delta }
        : typeof event.manpowerDelta === "number"
          ? { manpowerDelta: event.manpowerDelta }
          : {}),
      ...(typeof event.pillaged_gold === "number" && event.pillaged_gold > 0 ? { pillagedGold: event.pillaged_gold } : {}),
      ...(typeof event.pillaged_strategic_json === "string" && event.pillaged_strategic_json.length > 0
        ? {
            pillagedStrategic: JSON.parse(event.pillaged_strategic_json) as Partial<Record<StrategicResourceKey, number>>
          }
        : {}),
      ...(combatResult ? { combatResult } : {})
    };
  }
  if (event.event_type === "COMBAT_CANCELLED") {
    const cancelledCommandIds = (event.cancelled_command_ids ?? event.cancelledCommandIds ?? []).filter(
      (commandId): commandId is string => typeof commandId === "string" && commandId.length > 0
    );
    return {
      eventType: "COMBAT_CANCELLED",
      commandId: event.command_id,
      playerId: event.player_id,
      count: Number(event.count ?? 0),
      ...(cancelledCommandIds.length > 0 ? { cancelledCommandIds } : {})
    };
  }
  if (event.event_type === "TILE_DELTA_BATCH") {
    const tileDeltas =
      Array.isArray(event.tile_deltas) && event.tile_deltas.length > 0
        ? event.tile_deltas.map((tile) => normalizeProtoTile(tile))
        : parseJsonTileDeltas(event.tileDeltaJson || event.tile_delta_json || "");
    return {
      eventType: "TILE_DELTA_BATCH",
      commandId: event.command_id,
      playerId: event.player_id,
      tileDeltas
    };
  }
  if (event.event_type === "COLLECT_RESULT") {
    let strategic: Partial<Record<StrategicResourceKey, number>> = {};
    if (typeof event.strategic_json === "string" && event.strategic_json.length > 0) {
      try {
        strategic = JSON.parse(event.strategic_json) as typeof strategic;
      } catch {
        strategic = {};
      }
    }
    return {
      eventType: "COLLECT_RESULT",
      commandId: event.command_id,
      playerId: event.player_id,
      mode: (event.collect_mode === "tile" ? "tile" : "visible"),
      ...(typeof event.collect_x === "number" ? { x: Number(event.collect_x) } : {}),
      ...(typeof event.collect_y === "number" ? { y: Number(event.collect_y) } : {}),
      tiles: Number(event.tiles ?? 0),
      gold: Number(event.gold ?? 0),
      strategic
    };
  }
  if (event.event_type === "TECH_UPDATE" || event.event_type === "DOMAIN_UPDATE") {
    let payload: Record<string, unknown> = {};
    if (typeof event.payload_json === "string" && event.payload_json.length > 0) {
      try {
        const parsed = JSON.parse(event.payload_json) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") payload = parsed;
      } catch {
        payload = {};
      }
    }
    return {
      eventType: event.event_type,
      commandId: event.command_id,
      playerId: event.player_id,
      payload
    };
  }
  if (event.event_type === "PLAYER_MESSAGE") {
    let payload: Record<string, unknown> = {};
    if (typeof event.payload_json === "string" && event.payload_json.length > 0) {
      try {
        const parsed = JSON.parse(event.payload_json) as Record<string, unknown>;
        if (parsed && typeof parsed === "object") payload = parsed;
      } catch {
        payload = {};
      }
    }
    return {
      eventType: "PLAYER_MESSAGE",
      commandId: event.command_id,
      playerId: event.player_id,
      messageType: event.message_type || "",
      payload
    };
  }
  if (event.event_type === "COMMAND_REJECTED") {
    return {
      eventType: "COMMAND_REJECTED",
      commandId: event.command_id,
      playerId: event.player_id,
      code: event.code,
      message: event.message
    };
  }
  // Internal-only simulation events (e.g. TILE_YIELD_ANCHOR_UPDATED) reach the
  // gateway over the same gRPC stream but have no client-facing payload. We
  // used to fall through to COMMAND_REJECTED, which made every accrual-time
  // anchor update appear at the client as an empty-code, empty-message ERROR
  // (#233 filtered AI cross-talk but these are tagged with the human's
  // playerId, so the per-player filter doesn't help).
  return undefined;
};

const parseSubscriptionSnapshot = (
  response: ProtoSubscribePlayerAck & Record<string, unknown>,
  playerId: string
): PlayerSubscriptionSnapshot => {
  let parsedPlayer: PlayerSubscriptionSnapshot["player"] | undefined;
  let parsedWorldStatus: PlayerSubscriptionSnapshot["worldStatus"] | undefined;
  let parsedSeason: PlayerSubscriptionSnapshot["season"] | undefined;
  const candidatePlayerJsonValues: string[] = [];
  if (typeof response.player_json === "string") candidatePlayerJsonValues.push(response.player_json);
  if (typeof response.playerJson === "string") candidatePlayerJsonValues.push(response.playerJson);
  for (const json of candidatePlayerJsonValues) {
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as PlayerSubscriptionSnapshot["player"];
      if (parsed && typeof parsed === "object") {
        parsedPlayer = parsed;
        break;
      }
    } catch {
      continue;
    }
  }
  const candidateWorldStatusJsonValues: string[] = [];
  if (typeof response.world_status_json === "string") candidateWorldStatusJsonValues.push(response.world_status_json);
  if (typeof response.worldStatusJson === "string") candidateWorldStatusJsonValues.push(response.worldStatusJson);
  for (const json of candidateWorldStatusJsonValues) {
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as PlayerSubscriptionSnapshot["worldStatus"];
      if (parsed && typeof parsed === "object") {
        parsedWorldStatus = parsed;
        break;
      }
    } catch {
      continue;
    }
  }
  const candidateSeasonJsonValues: string[] = [];
  if (typeof response.season_json === "string") candidateSeasonJsonValues.push(response.season_json);
  if (typeof response.seasonJson === "string") candidateSeasonJsonValues.push(response.seasonJson);
  for (const json of candidateSeasonJsonValues) {
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as SimulationSeasonState;
      if (parsed && typeof parsed === "object") {
        parsedSeason = parsed;
        break;
      }
    } catch {
      continue;
    }
  }
  const parsedDocks = Array.isArray(response.docks)
    ? response.docks
        .map((dock) => normalizeProtoDock(dock))
        .filter((dock): dock is PlayerSubscriptionDock => Boolean(dock))
    : [];
  if (Array.isArray(response.tiles) && response.tiles.length > 0) {
    const responsePlayerId =
      typeof response.player_id === "string"
        ? response.player_id
        : typeof response.playerId === "string"
          ? response.playerId
          : playerId;
    return {
      playerId: responsePlayerId,
      ...(parsedPlayer ? { player: parsedPlayer } : {}),
      ...(parsedWorldStatus ? { worldStatus: parsedWorldStatus } : {}),
      ...(parsedSeason ? { season: parsedSeason } : {}),
      ...(parsedDocks.length ? { docks: parsedDocks } : {}),
      tiles: response.tiles.map((tile) => normalizeProtoTile(tile))
    };
  }

  const candidateJsonValues: string[] = [];
  if (typeof response.snapshot === "string") candidateJsonValues.push(response.snapshot);
  if (typeof response.snapshot_json === "string") candidateJsonValues.push(response.snapshot_json);
  if (typeof response.snapshotJson === "string") candidateJsonValues.push(response.snapshotJson);
  for (const value of Object.values(response)) {
    if (typeof value === "string") candidateJsonValues.push(value);
  }

  for (const json of candidateJsonValues) {
    if (!json) continue;
    try {
      const parsed = JSON.parse(json) as PlayerSubscriptionSnapshot;
      if (parsed && typeof parsed === "object" && Array.isArray(parsed.tiles)) {
        if (!parsed.player && parsedPlayer) parsed.player = parsedPlayer;
        if (!parsed.worldStatus && parsedWorldStatus) parsed.worldStatus = parsedWorldStatus;
        if (!parsed.season && parsedSeason) parsed.season = parsedSeason;
        if (!parsed.docks && parsedDocks.length) parsed.docks = parsedDocks;
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return {
    playerId,
    ...(parsedPlayer ? { player: parsedPlayer } : {}),
    ...(parsedWorldStatus ? { worldStatus: parsedWorldStatus } : {}),
    ...(parsedSeason ? { season: parsedSeason } : {}),
    ...(parsedDocks.length ? { docks: parsedDocks } : {}),
    tiles: []
  };
};

const parseFetchTileDetailAck = (
  response: ProtoFetchTileDetailAck & Record<string, unknown>,
  playerId: string,
  fallbackX: number,
  fallbackY: number
): FetchTileDetailResult => {
  const responsePlayerId =
    typeof response.player_id === "string"
      ? response.player_id
      : typeof response.playerId === "string"
        ? response.playerId
        : playerId;
  const tiles = Array.isArray(response.tiles) ? response.tiles.map((tile) => normalizeProtoTile(tile)) : [];
  const upkeepJson =
    typeof response.player_upkeep_json === "string"
      ? response.player_upkeep_json
      : typeof response.playerUpkeepJson === "string"
        ? response.playerUpkeepJson
        : undefined;
  let upkeepLastTick: FetchTileDetailResult["upkeepLastTick"];
  if (upkeepJson) {
    try {
      upkeepLastTick = JSON.parse(upkeepJson) as FetchTileDetailResult["upkeepLastTick"];
    } catch {
      upkeepLastTick = undefined;
    }
  }
  return {
    playerId: responsePlayerId,
    x: typeof response.x === "number" ? response.x : fallbackX,
    y: typeof response.y === "number" ? response.y : fallbackY,
    tiles,
    ...(upkeepLastTick ? { upkeepLastTick } : {})
  };
};

export const startSimulationEventStream = (
  openStream: () => SimulationEventStream,
  listener: (event: SimulationClientEvent) => void,
  options?: {
    onConnect?: () => void;
    onDisconnect?: (error: Error | null) => void;
    onUnknownEvent?: (eventType: string) => void;
  }
): (() => void) => {
  let closed = false;
  let reconnectDelayMs = 250;
  let activeStream: SimulationEventStream | null = null;
  let reconnectScheduled = false;
  let streamGeneration = 0;

  const scheduleReconnect = (generation: number, error: Error | null): void => {
    if (generation !== streamGeneration) return;
    if (closed || reconnectScheduled) return;
    reconnectScheduled = true;
    options?.onDisconnect?.(error);
    setTimeout(() => {
      reconnectScheduled = false;
      connect();
    }, reconnectDelayMs);
    reconnectDelayMs = Math.min(reconnectDelayMs * 2, 2_000);
  };

  const connect = (): void => {
    if (closed) return;
    streamGeneration += 1;
    const generation = streamGeneration;
    const stream = openStream();
    activeStream = stream;
    options?.onConnect?.();
    stream.on("data", (event) => {
      reconnectDelayMs = 250;
      const protoEvent = event as ProtoSimulationEvent;
      const translated = fromProtoEvent(protoEvent);
      if (translated) {
        listener(translated);
      } else {
        options?.onUnknownEvent?.(String(protoEvent.event_type ?? ""));
      }
    });
    stream.on("error", (error) => {
      scheduleReconnect(generation, error as Error);
    });
    stream.on("end", () => {
      scheduleReconnect(generation, null);
    });
  };

  connect();
  return () => {
    closed = true;
    activeStream?.cancel();
  };
};

export type FetchTileDetailResult = {
  playerId: string;
  x: number;
  y: number;
  tiles: PlayerSubscriptionSnapshot["tiles"];
  upkeepLastTick?: NonNullable<PlayerSubscriptionSnapshot["player"]>["upkeepLastTick"];
};

export const createSimulationClientFromRpcClient = (client: SimulationClientLike): {
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  preparePlayer: (playerId: string, rallyAnchor?: PreparePlayerRallyAnchor) => Promise<{ playerId: string; spawned: boolean }>;
  subscribePlayer: (playerId: string, subscriptionJson?: string) => Promise<PlayerSubscriptionSnapshot>;
  fetchTileDetail?: (playerId: string, x: number, y: number, fullVisibility?: boolean) => Promise<FetchTileDetailResult>;
  unsubscribePlayer: (playerId: string, subscriptionKey?: string) => Promise<void>;
  getSubscriptionNamespace: () => Promise<string>;
  ping: () => Promise<void>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getAdminPlayers: () => Promise<AdminPlayerRow[]>;
  getRecentCommands: (limit?: number) => Promise<GetRecentCommandsResponse>;
  startNextSeason: (force?: boolean, imperialWard?: { playerId: string; charges: number }) => Promise<{ seasonId: string }>;
  seedBarbarians: (count?: number) => Promise<SeedBarbariansResult>;
  streamEvents: (
    listener: (event: SimulationClientEvent) => void,
    options?: {
      onConnect?: () => void;
      onDisconnect?: (error: Error | null) => void;
      onUnknownEvent?: (eventType: string) => void;
    }
  ) => () => void;
} => ({
  submitCommand(command) {
    return new Promise<void>((resolve, reject) => {
      client.SubmitCommand(toProtoCommand(command), (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  },
  preparePlayer(playerId, rallyAnchor) {
    return new Promise<{ playerId: string; spawned: boolean }>((resolve, reject) => {
      const preparePlayerRpc =
        (typeof client.PreparePlayer === "function" ? client.PreparePlayer.bind(client) : undefined) ??
        (
          client as SimulationClientLike & {
            preparePlayer?: SimulationClientLike["PreparePlayer"];
          }
        ).preparePlayer?.bind(client);
      if (!preparePlayerRpc) {
        reject(new Error("simulation client preparePlayer RPC is unavailable"));
        return;
      }
      preparePlayerRpc(
        { player_id: playerId, ...(rallyAnchor ? { rally_anchor_json: JSON.stringify(rallyAnchor) } : {}) },
        (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          playerId:
            typeof response.player_id === "string"
              ? response.player_id
              : typeof response.playerId === "string"
                ? response.playerId
                : playerId,
          spawned: response.spawned === true
        });
      });
    });
  },
  subscribePlayer(playerId, subscriptionJson = "{}") {
    return new Promise<PlayerSubscriptionSnapshot>((resolve, reject) => {
      client.SubscribePlayer({ player_id: playerId, subscription_json: subscriptionJson }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(parseSubscriptionSnapshot(response as ProtoSubscribePlayerAck & Record<string, unknown>, playerId));
      });
    });
  },
  fetchTileDetail(playerId, x, y, fullVisibility = false) {
    return new Promise<FetchTileDetailResult>((resolve, reject) => {
      const fetchTileDetailRpc =
        typeof client.FetchTileDetail === "function" ? client.FetchTileDetail.bind(client) : undefined;
      if (!fetchTileDetailRpc) {
        reject(new Error("simulation client FetchTileDetail RPC is unavailable"));
        return;
      }
      fetchTileDetailRpc({ player_id: playerId, x, y, full_visibility: fullVisibility }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(parseFetchTileDetailAck(response as ProtoFetchTileDetailAck & Record<string, unknown>, playerId, x, y));
      });
    });
  },
  unsubscribePlayer(playerId, subscriptionKey) {
    return new Promise<void>((resolve, reject) => {
      client.UnsubscribePlayer(
        { player_id: playerId, ...(subscriptionKey ? { subscription_key: subscriptionKey } : {}) },
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }
      );
    });
  },
  getSubscriptionNamespace() {
    return new Promise<string>((resolve, reject) => {
      if (typeof client.GetSubscriptionNamespace !== "function") {
        reject(new Error("simulation client GetSubscriptionNamespace RPC is unavailable"));
        return;
      }
      client.GetSubscriptionNamespace({}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const namespace = response.namespace;
        if (typeof namespace !== "string" || namespace.length === 0) {
          reject(new Error("simulation subscription namespace payload missing"));
          return;
        }
        resolve(namespace);
      });
    });
  },
  ping() {
    return new Promise<void>((resolve, reject) => {
      client.Ping({ at: Date.now() }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  },
  getCurrentSeasonSummary() {
    return new Promise<CurrentSeasonSummary>((resolve, reject) => {
      if (typeof client.GetCurrentSeasonSummary !== "function") {
        reject(new Error("simulation client GetCurrentSeasonSummary RPC is unavailable"));
        return;
      }
      client.GetCurrentSeasonSummary({}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const payload = response.summary_json ?? response.summaryJson;
        if (!payload) {
          reject(new Error("simulation current season summary payload missing"));
          return;
        }
        resolve(JSON.parse(payload) as CurrentSeasonSummary);
      });
    });
  },
  listSeasonArchives() {
    return new Promise<SeasonArchiveRow[]>((resolve, reject) => {
      if (typeof client.ListSeasonArchives !== "function") {
        reject(new Error("simulation client ListSeasonArchives RPC is unavailable"));
        return;
      }
      client.ListSeasonArchives({}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const payload = response.archives_json ?? response.archivesJson;
        if (!payload) {
          resolve([]);
          return;
        }
        resolve(JSON.parse(payload) as SeasonArchiveRow[]);
      });
    });
  },
  getAdminPlayers() {
    return new Promise<AdminPlayerRow[]>((resolve, reject) => {
      if (typeof client.GetAdminPlayers !== "function") {
        reject(new Error("simulation client GetAdminPlayers RPC is unavailable"));
        return;
      }
      client.GetAdminPlayers({}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const payload = response.players_json ?? response.playersJson;
        if (!payload) {
          resolve([]);
          return;
        }
        resolve(JSON.parse(payload) as AdminPlayerRow[]);
      });
    });
  },

  getRecentCommands(limit: number = 25) {
    return new Promise<GetRecentCommandsResponse>((resolve, reject) => {
      if (typeof client.GetRecentCommands !== "function") {
        reject(new Error("simulation client GetRecentCommands RPC is unavailable"));
        return;
      }
      client.GetRecentCommands({ limit }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const payload = response.commands_json ?? response.commandsJson;
        if (!payload) {
          resolve({ ok: true, commands: [] });
          return;
        }
        resolve({ ok: true, commands: JSON.parse(payload) });
      });
    });
  },
  startNextSeason(force = false, imperialWard?: { playerId: string; charges: number }) {
    return new Promise<{ seasonId: string }>((resolve, reject) => {
      if (typeof client.StartNextSeason !== "function") {
        reject(new Error("simulation client StartNextSeason RPC is unavailable"));
        return;
      }
      client.StartNextSeason({ force, imperial_ward_json: imperialWard ? JSON.stringify(imperialWard) : undefined }, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        resolve({
          seasonId: response.season_id ?? response.seasonId ?? ""
        });
      });
    });
  },
  seedBarbarians(count) {
    return new Promise<SeedBarbariansResult>((resolve, reject) => {
      if (typeof client.SeedBarbarians !== "function") {
        reject(new Error("simulation client SeedBarbarians RPC is unavailable"));
        return;
      }
      client.SeedBarbarians(typeof count === "number" ? { count } : {}, (error, response) => {
        if (error) {
          reject(error);
          return;
        }
        const detailJson = response.detail_json ?? response.detailJson;
        resolve({
          requested: response.requested ?? 0,
          placed: response.placed ?? 0,
          detail: detailJson ? (JSON.parse(detailJson) as Record<string, unknown>) : {}
        });
      });
    });
  },
  streamEvents(listener, options) {
    return startSimulationEventStream(() => client.StreamEvents({ at: Date.now() }), listener, options);
  }
});

export const createSimulationClient = (address: string): {
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  preparePlayer: (playerId: string, rallyAnchor?: PreparePlayerRallyAnchor) => Promise<{ playerId: string; spawned: boolean }>;
  subscribePlayer: (playerId: string, subscriptionJson?: string) => Promise<PlayerSubscriptionSnapshot>;
  fetchTileDetail?: (playerId: string, x: number, y: number, fullVisibility?: boolean) => Promise<FetchTileDetailResult>;
  unsubscribePlayer: (playerId: string, subscriptionKey?: string) => Promise<void>;
  getSubscriptionNamespace: () => Promise<string>;
  ping: () => Promise<void>;
  getCurrentSeasonSummary: () => Promise<CurrentSeasonSummary>;
  listSeasonArchives: () => Promise<SeasonArchiveRow[]>;
  getAdminPlayers: () => Promise<AdminPlayerRow[]>;
  getRecentCommands: (limit?: number) => Promise<GetRecentCommandsResponse>;
  startNextSeason: (force?: boolean, imperialWard?: { playerId: string; charges: number }) => Promise<{ seasonId: string }>;
  seedBarbarians: (count?: number) => Promise<SeedBarbariansResult>;
  streamEvents: (
    listener: (event: SimulationClientEvent) => void,
    options?: {
      onConnect?: () => void;
      onDisconnect?: (error: Error | null) => void;
      onUnknownEvent?: (eventType: string) => void;
    }
  ) => () => void;
} => {
  const client = new proto.border_empires.simulation.SimulationService(address, credentials.createInsecure());
  return createSimulationClientFromRpcClient(client);
};
