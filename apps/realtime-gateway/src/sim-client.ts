import { fileURLToPath } from "node:url";

import { credentials, loadPackageDefinition, type ClientReadableStream } from "@grpc/grpc-js";
import { loadSync } from "@grpc/proto-loader";

import { SIMULATION_PROTO_PATH, type CommandEnvelope, type PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

type ProtoAck = { ok: boolean };
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
  yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> };
  yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> };
  yieldCap?: { gold: number; strategicEach: number };
};
type ProtoSubscribePlayerAck = {
  ok: boolean;
  player_id?: string;
  playerId?: string;
  player_json?: string;
  playerJson?: string;
  world_status_json?: string;
  worldStatusJson?: string;
  tiles?: ProtoTileDelta[];
  snapshot?: string;
  snapshot_json?: string;
  snapshotJson?: string;
};
type ProtoSubscribePlayerRequest = {
  player_id: string;
  subscription_json: string;
};
type ProtoUnsubscribePlayerRequest = {
  player_id: string;
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
};

type SimulationClientLike = {
  SubmitCommand: (request: Record<string, unknown>, callback: (error: Error | null, response: ProtoAck) => void) => void;
  SubscribePlayer: (
    request: ProtoSubscribePlayerRequest,
    callback: (error: Error | null, response: ProtoSubscribePlayerAck) => void
  ) => void;
  UnsubscribePlayer: (
    request: ProtoUnsubscribePlayerRequest,
    callback: (error: Error | null, response: ProtoAck) => void
  ) => void;
  Ping: (request: Record<string, unknown>, callback: (error: Error | null, response: ProtoAck) => void) => void;
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
      pillagedStrategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
    }
  | {
      eventType: "TILE_DELTA_BATCH";
      commandId: string;
      playerId: string;
      tileDeltas: Array<{
        x: number;
        y: number;
        terrain?: "LAND" | "SEA" | "MOUNTAIN";
        resource?: string | undefined;
        dockId?: string | undefined;
        ownerId?: string | undefined;
        ownershipState?: string | undefined;
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
        yield?: { gold?: number; strategic?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
        yieldRate?: { goldPerMinute?: number; strategicPerDay?: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> } | undefined;
        yieldCap?: { gold: number; strategicEach: number } | undefined;
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
      strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>>;
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

const normalizeProtoTile = (tile: ProtoTileDelta): NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number] => {
  const normalized: NonNullable<Extract<SimulationClientEvent, { eventType: "TILE_DELTA_BATCH" }>["tileDeltas"]>[number] = {
    x: tile.x,
    y: tile.y
  };
  if (tile.terrain === "LAND" || tile.terrain === "SEA" || tile.terrain === "MOUNTAIN") normalized.terrain = tile.terrain;
  if (typeof tile.resource === "string" && tile.resource.length > 0) normalized.resource = tile.resource;
  if ("dock_id" in tile || "dockId" in tile) normalized.dockId = tile.dock_id || tile.dockId || undefined;
  if ("owner_id" in tile || "ownerId" in tile) normalized.ownerId = tile.owner_id || tile.ownerId || undefined;
  if ("ownership_state" in tile || "ownershipState" in tile) normalized.ownershipState = tile.ownership_state || tile.ownershipState || undefined;
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
  if ("yield" in tile && tile.yield && typeof tile.yield === "object") {
    normalized.yield = tile.yield as NonNullable<typeof normalized.yield>;
  }
  if ("yieldRate" in tile && tile.yieldRate && typeof tile.yieldRate === "object") {
    normalized.yieldRate = tile.yieldRate as NonNullable<typeof normalized.yieldRate>;
  }
  if ("yieldCap" in tile && tile.yieldCap && typeof tile.yieldCap === "object") {
    normalized.yieldCap = tile.yieldCap as NonNullable<typeof normalized.yieldCap>;
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

const fromProtoEvent = (event: ProtoSimulationEvent): SimulationClientEvent => {
  if (event.event_type === "COMMAND_ACCEPTED") {
    return {
      eventType: "COMMAND_ACCEPTED",
      commandId: event.command_id,
      playerId: event.player_id,
      actionType: event.action_type,
      originX: event.origin_x,
      originY: event.origin_y,
      targetX: event.target_x,
      targetY: event.target_y,
      resolvesAt: event.resolves_at
    };
  }
  if (event.event_type === "COMBAT_RESOLVED") {
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
            pillagedStrategic: JSON.parse(event.pillaged_strategic_json) as Partial<
              Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>
            >
          }
        : {})
    };
  }
  if (event.event_type === "COMBAT_CANCELLED") {
    return {
      eventType: "COMBAT_CANCELLED",
      commandId: event.command_id,
      playerId: event.player_id,
      count: Number(event.count ?? 0)
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
    let strategic: Partial<Record<"FOOD" | "IRON" | "CRYSTAL" | "SUPPLY" | "SHARD" | "OIL", number>> = {};
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
  return {
    eventType: "COMMAND_REJECTED",
    commandId: event.command_id,
    playerId: event.player_id,
    code: event.code,
    message: event.message
  };
};

const parseSubscriptionSnapshot = (
  response: ProtoSubscribePlayerAck & Record<string, unknown>,
  playerId: string
): PlayerSubscriptionSnapshot => {
  let parsedPlayer: PlayerSubscriptionSnapshot["player"] | undefined;
  let parsedWorldStatus: PlayerSubscriptionSnapshot["worldStatus"] | undefined;
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
    tiles: []
  };
};

export const startSimulationEventStream = (
  openStream: () => SimulationEventStream,
  listener: (event: SimulationClientEvent) => void,
  options?: { onDisconnect?: (error: Error | null) => void }
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
    stream.on("data", (event) => {
      reconnectDelayMs = 250;
      listener(fromProtoEvent(event as ProtoSimulationEvent));
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

export const createSimulationClientFromRpcClient = (client: SimulationClientLike): {
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  subscribePlayer: (playerId: string, subscriptionJson?: string) => Promise<PlayerSubscriptionSnapshot>;
  unsubscribePlayer: (playerId: string) => Promise<void>;
  ping: () => Promise<void>;
  streamEvents: (
    listener: (event: SimulationClientEvent) => void,
    options?: { onDisconnect?: (error: Error | null) => void }
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
  unsubscribePlayer(playerId) {
    return new Promise<void>((resolve, reject) => {
      client.UnsubscribePlayer({ player_id: playerId }, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
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
  streamEvents(listener, options) {
    return startSimulationEventStream(() => client.StreamEvents({ at: Date.now() }), listener, options);
  }
});

export const createSimulationClient = (address: string): {
  submitCommand: (command: CommandEnvelope) => Promise<void>;
  subscribePlayer: (playerId: string, subscriptionJson?: string) => Promise<PlayerSubscriptionSnapshot>;
  unsubscribePlayer: (playerId: string) => Promise<void>;
  ping: () => Promise<void>;
  streamEvents: (
    listener: (event: SimulationClientEvent) => void,
    options?: { onDisconnect?: (error: Error | null) => void }
  ) => () => void;
} => {
  const client = new proto.border_empires.simulation.SimulationService(address, credentials.createInsecure());
  return createSimulationClientFromRpcClient(client);
};
