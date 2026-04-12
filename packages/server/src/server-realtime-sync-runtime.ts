import type { Player, Tile, TileKey } from "@border-empires/shared";
import type { VisibilitySnapshot } from "./chunk/snapshots.js";
import type { Ws } from "./server-runtime-config.js";

type AuthIdentityLike = {
  playerId?: string | undefined;
  email?: string | undefined;
};

type PlayerDebugEvent = (level: "info" | "warn" | "error", event: string, payload: Record<string, unknown>) => void;

export interface CreateServerRealtimeSyncRuntimeDeps {
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  OBSERVATORY_VISION_BONUS: number;
  TILE_SYNC_DEBUG: boolean;
  TILE_SYNC_DEBUG_EMAILS: Set<string>;
  players: Map<string, Player>;
  authIdentityByUid: Map<string, AuthIdentityLike>;
  socketsByPlayer: Map<string, Ws>;
  bulkSocketsByPlayer: Map<string, Ws>;
  chunkSubscriptionByPlayer: Map<string, { cx: number; cy: number; radius: number }>;
  chunkSnapshotInFlightByPlayer: Map<string, number>;
  townsByTile: Map<TileKey, unknown>;
  docksByTile: Map<TileKey, { dockId: string }>;
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, { clusterType?: Tile["clusterType"] }>;
  victoryPressureById: Map<string, { holdStartedAt?: number }>;
  now: () => number;
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  wrapX: (value: number, mod: number) => number;
  wrapY: (value: number, mod: number) => number;
  terrainAtRuntime: (x: number, y: number) => Tile["terrain"];
  activeSettlementTileKeyForPlayer: (playerId: string) => TileKey | undefined;
  ownedTownKeysForPlayer: (playerId: string) => TileKey[];
  playerTile: (x: number, y: number) => Tile;
  tileInSubscription: (playerId: string, x: number, y: number) => boolean;
  sendChunkSnapshot: (socket: Ws, player: Player, sub: { cx: number; cy: number; radius: number }) => void;
  visibilitySnapshotForPlayer: (player: Player) => VisibilitySnapshot;
  visibleInSnapshot: (snapshot: VisibilitySnapshot, x: number, y: number) => boolean;
  visible: (player: Player, x: number, y: number) => boolean;
  effectiveVisionRadiusForPlayer: (player: Player) => number;
  isValidCapitalTile: (player: Player, tileKey: TileKey | undefined) => tileKey is TileKey;
  chooseCapitalTileKey: (player: Player) => TileKey | undefined;
  resolveControlSocketForPlayer: (controlSockets: Map<string, Ws>, playerId: string) => Ws | undefined;
  resolveBulkSocketForPlayer: (controlSockets: Map<string, Ws>, bulkSockets: Map<string, Ws>, playerId: string) => Ws | undefined;
  sendBulkPayloadToPlayer: (controlSockets: Map<string, Ws>, bulkSockets: Map<string, Ws>, playerId: string, payload: string) => void;
  sendHighPrioritySocketMessage: (socket: Ws | undefined, payload: string) => void;
  recordServerDebugEvent: PlayerDebugEvent;
  appLogInfo: (payload: Record<string, unknown>, message: string) => void;
}

export interface ServerRealtimeSyncRuntime {
  logTileSync: (event: string, payload: Record<string, unknown>) => void;
  actionValidationPayload: (
    playerId: string,
    action: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK",
    fromTile: ReturnType<CreateServerRealtimeSyncRuntimeDeps["playerTile"]>,
    toTile: ReturnType<CreateServerRealtimeSyncRuntimeDeps["playerTile"]>,
    extra?: Record<string, unknown>
  ) => Record<string, unknown>;
  sendVisibleTileDeltaAt: (x: number, y: number) => void;
  sendVisibleTileDeltaSquare: (x: number, y: number, radius: number) => void;
  refreshVisibleOwnedTownsForPlayer: (playerId: string) => void;
  refreshVisibleNearbyTownDeltas: (x: number, y: number) => void;
  reconcileCapitalForPlayer: (player: Player) => void;
  controlSocketForPlayer: (playerId: string) => Ws | undefined;
  bulkSocketForPlayer: (playerId: string) => Ws | undefined;
  sendControlToPlayer: (playerId: string, payload: unknown) => void;
  sendToPlayer: (playerId: string, payload: unknown) => void;
  sendControlToSocket: (socket: Ws | undefined, payload: unknown, meta?: Record<string, unknown>) => void;
  sendBulkToPlayer: (playerId: string, payload: unknown) => void;
  onlineSocketCount: () => number;
  hasOnlinePlayers: () => boolean;
  pauseVictoryPressureTimers: () => void;
  resumeVictoryPressureTimers: () => void;
  clearVictoryPressurePauseState: () => void;
  isVisibleToAnyOnlinePlayer: (x: number, y: number) => boolean;
  refreshSubscribedViewForPlayer: (playerId: string) => void;
  fogTileForPlayer: (x: number, y: number) => Tile;
  visibleTileForPlayer: (player: Player, x: number, y: number, snapshot?: VisibilitySnapshot) => Tile;
  sendLocalVisionDeltaForPlayer: (playerId: string, centers: Array<{ x: number; y: number }>) => void;
  broadcastLocalVisionDelta: (centers: Array<{ x: number; y: number }>) => void;
}

export const createServerRealtimeSyncRuntime = (
  deps: CreateServerRealtimeSyncRuntimeDeps
): ServerRealtimeSyncRuntime => {
  const logTileSync = (event: string, payload: Record<string, unknown>): void => {
    const playerId = typeof payload.playerId === "string" ? payload.playerId : undefined;
    const playerEmail = playerId
      ? [...deps.authIdentityByUid.values()].find((identity) => identity.playerId === playerId)?.email?.toLowerCase()
      : undefined;
    if (!deps.TILE_SYNC_DEBUG && (!playerEmail || !deps.TILE_SYNC_DEBUG_EMAILS.has(playerEmail))) return;
    deps.appLogInfo(payload, `tile sync ${event}`);
  };

  const actionValidationPayload = (
    playerId: string,
    action: "ATTACK" | "EXPAND" | "BREAKTHROUGH_ATTACK",
    fromTile: ReturnType<CreateServerRealtimeSyncRuntimeDeps["playerTile"]>,
    toTile: ReturnType<CreateServerRealtimeSyncRuntimeDeps["playerTile"]>,
    extra: Record<string, unknown> = {}
  ): Record<string, unknown> => ({
    playerId,
    action,
    from: deps.key(fromTile.x, fromTile.y),
    fromOwnerId: fromTile.ownerId,
    fromOwnershipState: fromTile.ownershipState,
    to: deps.key(toTile.x, toTile.y),
    toOwnerId: toTile.ownerId,
    toOwnershipState: toTile.ownershipState,
    ...extra
  });

  const controlSocketForPlayer = (playerId: string): Ws | undefined =>
    deps.resolveControlSocketForPlayer(deps.socketsByPlayer, playerId);

  const bulkSocketForPlayer = (playerId: string): Ws | undefined =>
    deps.resolveBulkSocketForPlayer(deps.socketsByPlayer, deps.bulkSocketsByPlayer, playerId);

  const compactServerControlPayload = (payload: unknown): Record<string, unknown> | undefined => {
    if (!payload || typeof payload !== "object") return undefined;
    const message = payload as Record<string, unknown>;
    const messageType = typeof message.type === "string" ? message.type : undefined;
    if (!messageType || !new Set(["ACTION_ACCEPTED", "COMBAT_START", "COMBAT_RESULT", "ERROR", "ATTACK_ALERT"]).has(messageType)) {
      return undefined;
    }
    return {
      type: messageType,
      ...(typeof message.actionType === "string" ? { actionType: message.actionType } : {}),
      ...(typeof message.code === "string" ? { code: message.code } : {}),
      ...(typeof message.message === "string" ? { message: message.message } : {}),
      ...(message.origin && typeof message.origin === "object" ? { origin: message.origin } : {}),
      ...(message.target && typeof message.target === "object" ? { target: message.target } : {}),
      ...(typeof message.resolvesAt === "number" ? { resolvesAt: message.resolvesAt } : {}),
      ...(typeof message.attackerId === "string" ? { attackerId: message.attackerId } : {}),
      ...(typeof message.x === "number" && typeof message.y === "number" ? { x: message.x, y: message.y } : {})
    };
  };

  const sendControlToPlayer = (playerId: string, payload: unknown): void => {
    const socket = controlSocketForPlayer(playerId);
    const compactPayload = compactServerControlPayload(payload);
    if (compactPayload) {
      deps.recordServerDebugEvent("info", "send_control_message", {
        playerId,
        socketReadyState: socket?.readyState,
        bufferedAmount: typeof socket?.bufferedAmount === "number" ? socket.bufferedAmount : undefined,
        ...compactPayload
      });
    }
    deps.sendHighPrioritySocketMessage(socket, JSON.stringify(payload));
  };

  const sendToPlayer = sendControlToPlayer;

  const sendControlToSocket = (socket: Ws | undefined, payload: unknown, meta?: Record<string, unknown>): void => {
    const compactPayload = compactServerControlPayload(payload);
    if (compactPayload) {
      deps.recordServerDebugEvent("info", "send_control_socket_message", {
        socketReadyState: socket?.readyState,
        bufferedAmount: typeof socket?.bufferedAmount === "number" ? socket.bufferedAmount : undefined,
        ...(meta ?? {}),
        ...compactPayload
      });
    }
    deps.sendHighPrioritySocketMessage(socket, JSON.stringify(payload));
  };

  const sendBulkToPlayer = (playerId: string, payload: unknown): void => {
    deps.sendBulkPayloadToPlayer(deps.socketsByPlayer, deps.bulkSocketsByPlayer, playerId, JSON.stringify(payload));
  };

  const onlineSocketCount = (): number => {
    let count = 0;
    for (const socket of deps.socketsByPlayer.values()) {
      if (socket.readyState === socket.OPEN) count += 1;
    }
    return count;
  };

  const hasOnlinePlayers = (): boolean =>
    onlineSocketCount() > 0 || [...deps.players.values()].some((player) => player.isAi);

  let victoryPressurePausedAt: number | undefined;

  const pauseVictoryPressureTimers = (): void => {
    if (victoryPressurePausedAt === undefined) victoryPressurePausedAt = deps.now();
  };

  const resumeVictoryPressureTimers = (): void => {
    if (victoryPressurePausedAt === undefined) return;
    const delta = deps.now() - victoryPressurePausedAt;
    if (delta > 0) {
      for (const tracker of deps.victoryPressureById.values()) {
        if (tracker.holdStartedAt) tracker.holdStartedAt += delta;
      }
    }
    victoryPressurePausedAt = undefined;
  };

  const clearVictoryPressurePauseState = (): void => {
    victoryPressurePausedAt = undefined;
  };

  const VISIBLE_TILE_DELTA_BATCH_MS = 25;
  const pendingVisibleTileDeltasByPlayer = new Map<string, Map<TileKey, Tile>>();
  let visibleTileDeltaFlushTimeout: ReturnType<typeof setTimeout> | undefined;

  const flushQueuedVisibleTileDeltas = (): void => {
    visibleTileDeltaFlushTimeout = undefined;
    for (const [playerId, updatesByTileKey] of pendingVisibleTileDeltasByPlayer) {
      pendingVisibleTileDeltasByPlayer.delete(playerId);
      if (updatesByTileKey.size === 0) continue;
      sendBulkToPlayer(playerId, { type: "TILE_DELTA", updates: [...updatesByTileKey.values()] });
    }
  };

  const queueVisibleTileDeltaForPlayer = (playerId: string, tile: Tile): void => {
    let updatesByTileKey = pendingVisibleTileDeltasByPlayer.get(playerId);
    if (!updatesByTileKey) {
      updatesByTileKey = new Map<TileKey, Tile>();
      pendingVisibleTileDeltasByPlayer.set(playerId, updatesByTileKey);
    }
    updatesByTileKey.set(deps.key(tile.x, tile.y), { ...tile, fogged: false });
    if (visibleTileDeltaFlushTimeout !== undefined) return;
    visibleTileDeltaFlushTimeout = setTimeout(flushQueuedVisibleTileDeltas, VISIBLE_TILE_DELTA_BATCH_MS);
  };

  const sendVisibleTileDeltaAt = (x: number, y: number): void => {
    for (const player of deps.players.values()) {
      if (!deps.tileInSubscription(player.id, x, y)) continue;
      if (!deps.visible(player, x, y)) continue;
      const current = deps.playerTile(x, y);
      current.fogged = false;
      logTileSync("visible_tile_delta_sent", {
        playerId: player.id,
        tileKey: deps.key(x, y),
        ownerId: current.ownerId,
        ownershipState: current.ownershipState
      });
      queueVisibleTileDeltaForPlayer(player.id, current);
    }
  };

  const sendVisibleTileDeltaSquare = (x: number, y: number, radius: number): void => {
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        sendVisibleTileDeltaAt(
          deps.wrapX(x + dx, deps.WORLD_WIDTH),
          deps.wrapY(y + dy, deps.WORLD_HEIGHT)
        );
      }
    }
  };

  const refreshVisibleOwnedTownsForPlayer = (playerId: string): void => {
    for (const townKey of deps.ownedTownKeysForPlayer(playerId)) {
      const [x, y] = deps.parseKey(townKey);
      sendVisibleTileDeltaAt(x, y);
    }
  };

  const refreshVisibleNearbyTownDeltas = (x: number, y: number): void => {
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = deps.wrapX(x + dx, deps.WORLD_WIDTH);
        const ny = deps.wrapY(y + dy, deps.WORLD_HEIGHT);
        if (deps.townsByTile.has(deps.key(nx, ny))) sendVisibleTileDeltaAt(nx, ny);
      }
    }
  };

  const reconcileCapitalForPlayer = (player: Player): void => {
    const previous = player.capitalTileKey;
    const settlementTile = deps.activeSettlementTileKeyForPlayer(player.id);
    const next = settlementTile ?? (deps.isValidCapitalTile(player, previous) ? previous : deps.chooseCapitalTileKey(player));
    if (previous === next) return;
    if (next) player.capitalTileKey = next;
    else delete player.capitalTileKey;
    if (previous) {
      const [x, y] = deps.parseKey(previous);
      sendVisibleTileDeltaAt(x, y);
    }
    if (next) {
      const [x, y] = deps.parseKey(next);
      sendVisibleTileDeltaAt(x, y);
    }
  };

  const isVisibleToAnyOnlinePlayer = (x: number, y: number): boolean => {
    for (const player of deps.players.values()) {
      const socket = deps.socketsByPlayer.get(player.id);
      if (!socket || socket.readyState !== socket.OPEN) continue;
      if (deps.visible(player, x, y)) return true;
    }
    return false;
  };

  const refreshSubscribedViewForPlayer = (playerId: string): void => {
    const socket = bulkSocketForPlayer(playerId);
    const player = deps.players.get(playerId);
    const sub = deps.chunkSubscriptionByPlayer.get(playerId);
    if (!socket || socket.readyState !== socket.OPEN || !player || !sub) return;
    if (deps.chunkSnapshotInFlightByPlayer.has(playerId)) return;
    deps.sendChunkSnapshot(socket, player, sub);
  };

  const fogTileForPlayer = (x: number, y: number): Tile => {
    const tileKey = deps.key(x, y);
    const dock = deps.docksByTile.get(tileKey);
    const clusterId = deps.clusterByTile.get(tileKey);
    const clusterType = clusterId ? deps.clustersById.get(clusterId)?.clusterType : undefined;
    const fogTile: Tile = {
      x,
      y,
      terrain: deps.terrainAtRuntime(x, y),
      fogged: true,
      lastChangedAt: deps.now()
    };
    if (dock) fogTile.dockId = dock.dockId;
    if (clusterId) fogTile.clusterId = clusterId;
    if (clusterType) fogTile.clusterType = clusterType;
    return fogTile;
  };

  const visibleTileForPlayer = (player: Player, x: number, y: number, snapshot?: VisibilitySnapshot): Tile => {
    if ((snapshot ? deps.visibleInSnapshot(snapshot, x, y) : deps.visible(player, x, y))) {
      const tile = deps.playerTile(x, y);
      tile.fogged = false;
      return tile;
    }
    return fogTileForPlayer(x, y);
  };

  const sendLocalVisionDeltaForPlayer = (playerId: string, centers: Array<{ x: number; y: number }>): void => {
    const socket = deps.socketsByPlayer.get(playerId);
    const player = deps.players.get(playerId);
    const sub = deps.chunkSubscriptionByPlayer.get(playerId);
    if (!socket || socket.readyState !== socket.OPEN || !player || !sub || centers.length === 0) return;
    const radius = deps.effectiveVisionRadiusForPlayer(player) + deps.OBSERVATORY_VISION_BONUS;
    const snapshot = deps.visibilitySnapshotForPlayer(player);
    const seen = new Set<TileKey>();
    const updates: Tile[] = [];
    for (const center of centers) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          const x = deps.wrapX(center.x + dx, deps.WORLD_WIDTH);
          const y = deps.wrapY(center.y + dy, deps.WORLD_HEIGHT);
          if (!deps.tileInSubscription(playerId, x, y)) continue;
          const tileKey = deps.key(x, y);
          if (seen.has(tileKey)) continue;
          seen.add(tileKey);
          updates.push(visibleTileForPlayer(player, x, y, snapshot));
        }
      }
    }
    if (updates.length > 0) sendBulkToPlayer(playerId, { type: "TILE_DELTA", updates });
  };

  const broadcastLocalVisionDelta = (centers: Array<{ x: number; y: number }>): void => {
    for (const playerId of deps.socketsByPlayer.keys()) sendLocalVisionDeltaForPlayer(playerId, centers);
  };

  return {
    logTileSync,
    actionValidationPayload,
    sendVisibleTileDeltaAt,
    sendVisibleTileDeltaSquare,
    refreshVisibleOwnedTownsForPlayer,
    refreshVisibleNearbyTownDeltas,
    reconcileCapitalForPlayer,
    controlSocketForPlayer,
    bulkSocketForPlayer,
    sendControlToPlayer,
    sendToPlayer,
    sendControlToSocket,
    sendBulkToPlayer,
    onlineSocketCount,
    hasOnlinePlayers,
    pauseVictoryPressureTimers,
    resumeVictoryPressureTimers,
    clearVictoryPressurePauseState,
    isVisibleToAnyOnlinePlayer,
    refreshSubscribedViewForPlayer,
    fogTileForPlayer,
    visibleTileForPlayer,
    sendLocalVisionDeltaForPlayer,
    broadcastLocalVisionDelta
  };
};
