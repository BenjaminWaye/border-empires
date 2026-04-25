import type {
  BarbarianAgent,
  Player,
  Tile,
  TileKey
} from "@border-empires/shared";

import { appendPlayerActivityEntry, buildTownActivityEntry } from "./player-activity.js";
import type { AuthIdentity } from "./server-auth.js";
import type { ClusterDefinition, SnapshotState, TownDefinition } from "./server-shared-types.js";
import type { PlayerEffects } from "./server-effects.js";

type PlayerSocket = {
  OPEN: number;
  readyState: number;
};

export interface CreateServerPlayerRuntimeSupportDeps {
  players: Map<string, Player>;
  ownership: Map<TileKey, string>;
  ownershipStateByTile: Map<TileKey, Tile["ownershipState"]>;
  settledSinceByTile: Map<TileKey, number>;
  townsByTile: Map<TileKey, TownDefinition>;
  clusterByTile: Map<TileKey, string>;
  clustersById: Map<string, ClusterDefinition>;
  resourceCountsByPlayer: Map<string, Record<string, number>>;
  clusterControlledTilesByPlayer: Map<string, Map<string, number>>;
  barbarianAgents: Map<string, BarbarianAgent>;
  strategicResourceStockByPlayer: Map<string, Record<string, number>>;
  strategicResourceBufferByPlayer: Map<string, Record<string, number>>;
  economyIndexByPlayer: Map<string, unknown>;
  dynamicMissionsByPlayer: Map<string, unknown[]>;
  forcedRevealTilesByPlayer: Map<string, Set<TileKey>>;
  playerEffectsByPlayer: Map<string, PlayerEffects>;
  playerBaseMods: Map<string, { attack: number; defense: number; income: number; vision: number }>;
  socketsByPlayer: Map<string, PlayerSocket>;
  BARBARIAN_OWNER_ID: string;
  WORLD_WIDTH: number;
  WORLD_HEIGHT: number;
  DEBUG_SPAWN_NEAR_AI: boolean;
  STARTING_GOLD: number;
  STARTING_MANPOWER: number;
  STAMINA_MAX: number;
  OFFLINE_YIELD_ACCUM_MAX_MS: number;
  colorFromId: (id: string) => string;
  playerStylePayload: (player: Player) => Record<string, unknown>;
  defaultMissionStats: () => Player["missionStats"];
  emptyStrategicStocks: () => Record<string, number>;
  emptyPlayerEconomyIndex: () => unknown;
  emptyPlayerEffects: () => PlayerEffects;
  setRevealTargetsForPlayer: (playerId: string, targets: string[]) => void;
  recomputePlayerEffectsForPlayer: (player: Player) => void;
  ensureMissionDefaults: (player: Player) => void;
  normalizePlayerProgressionState: (player: Player) => void;
  recomputeExposure: (player: Player) => void;
  ensureFallbackSettlementForPlayer: (playerId: string) => void;
  recomputeTownNetworkForPlayer: (playerId: string) => void;
  reconcileCapitalForPlayer: (player: Player) => void;
  updateMissionState: (player: Player) => void;
  removeBarbarianAgent: (barbarianId: string) => void;
  upsertBarbarianAgent: (agent: BarbarianAgent) => void;
  playerHomeTile: (player: Player) => { x: number; y: number } | undefined;
  playerTile: (x: number, y: number) => Tile;
  updateOwnership: (x: number, y: number, newOwner: string | undefined, newState?: Tile["ownershipState"]) => void;
  createSettlementAtTile: (playerId: string, tileKey: TileKey) => void;
  sendVisibleTileDeltaAt: (x: number, y: number) => void;
  broadcastBulk: (payload: unknown) => void;
  clusterResourceType: (cluster: ClusterDefinition) => Tile["resource"];
  key: (x: number, y: number) => TileKey;
  parseKey: (tileKey: TileKey) => [number, number];
  wrapX: (x: number, width: number) => number;
  wrapY: (y: number, height: number) => number;
  chebyshevDistance: (ax: number, ay: number, bx: number, by: number) => number;
  getOrInitResourceCounts: (playerId: string) => Record<string, number>;
  setClusterControlDelta: (playerId: string, clusterId: string, delta: number) => void;
  now: () => number;
  runtimeLogInfo: (payload: Record<string, unknown>, message: string) => void;
  runtimeLogError: (payload: Record<string, unknown>, message: string) => void;
}

export interface ServerPlayerRuntimeSupport {
  serializePlayer: (player: Player) => SnapshotState["players"][number];
  lastEconomyActivityAtForPlayer: (player: Player) => number;
  offlineUpkeepPausedForPlayer: (player: Player) => boolean;
  wakeOfflineEconomyForPlayer: (playerId: string | undefined) => void;
  queueOfflinePlayerActivity: (playerId: string, entry: import("@border-empires/shared").PlayerActivityEntry) => void;
  consumeOfflinePlayerActivity: (playerId: string) => import("@border-empires/shared").PlayerActivityEntry[];
  playerActivityName: (playerId: string | undefined) => string;
  queueOfflineTownCaptureActivity: (
    oldOwnerId: string | undefined,
    newOwnerId: string | undefined,
    town: TownDefinition
  ) => void;
  rebuildOwnershipDerivedState: () => void;
  spawnPlayer: (player: Player) => void;
  getOrCreatePlayerForIdentity: (identity: AuthIdentity) => Player | undefined;
}

export const createServerPlayerRuntimeSupport = (
  deps: CreateServerPlayerRuntimeSupportDeps
): ServerPlayerRuntimeSupport => {
  const serializePlayer = (player: Player): SnapshotState["players"][number] => ({
    ...player,
    techIds: [...player.techIds],
    domainIds: [...player.domainIds],
    territoryTiles: [...player.territoryTiles],
    allies: [...player.allies]
  });

  const lastEconomyActivityAtForPlayer = (player: Player): number =>
    Math.max(player.lastActiveAt, player.lastEconomyWakeAt ?? 0);

  const offlineUpkeepPausedForPlayer = (player: Player): boolean =>
    deps.now() - lastEconomyActivityAtForPlayer(player) > deps.OFFLINE_YIELD_ACCUM_MAX_MS;

  const wakeOfflineEconomyForPlayer = (playerId: string | undefined): void => {
    if (!playerId || playerId === deps.BARBARIAN_OWNER_ID) return;
    const player = deps.players.get(playerId);
    if (!player) return;
    player.lastEconomyWakeAt = deps.now();
  };

  const queueOfflinePlayerActivity = (playerId: string, entry: import("@border-empires/shared").PlayerActivityEntry): void => {
    const player = deps.players.get(playerId);
    if (!player) return;
    const socket = deps.socketsByPlayer.get(playerId);
    if (socket && socket.readyState === socket.OPEN) return;
    player.activityInbox = appendPlayerActivityEntry(player.activityInbox ?? [], entry);
  };

  const consumeOfflinePlayerActivity = (playerId: string): import("@border-empires/shared").PlayerActivityEntry[] => {
    const player = deps.players.get(playerId);
    if (!player || player.activityInbox.length === 0) return [];
    const pending = [...player.activityInbox];
    player.activityInbox = [];
    return pending;
  };

  const playerActivityName = (playerId: string | undefined): string => {
    if (!playerId) return "Neutral territory";
    if (playerId === deps.BARBARIAN_OWNER_ID) return "Barbarians";
    return deps.players.get(playerId)?.name ?? playerId.slice(0, 8);
  };

  const queueOfflineTownCaptureActivity = (
    oldOwnerId: string | undefined,
    newOwnerId: string | undefined,
    town: TownDefinition
  ): void => {
    if (!town.name) return;
    const occurredAt = deps.now();
    if (oldOwnerId && oldOwnerId !== deps.BARBARIAN_OWNER_ID && oldOwnerId !== newOwnerId) {
      queueOfflinePlayerActivity(
        oldOwnerId,
        buildTownActivityEntry({
          kind: "lost",
          townName: town.name,
          actorName: playerActivityName(newOwnerId),
          tileKey: town.tileKey,
          at: occurredAt
        })
      );
    }
    if (newOwnerId && newOwnerId !== deps.BARBARIAN_OWNER_ID && newOwnerId !== oldOwnerId) {
      queueOfflinePlayerActivity(
        newOwnerId,
        buildTownActivityEntry({
          kind: "captured",
          townName: town.name,
          actorName: playerActivityName(oldOwnerId),
          tileKey: town.tileKey,
          at: occurredAt
        })
      );
    }
  };

  const rebuildOwnershipDerivedState = (): void => {
    for (const player of deps.players.values()) {
      player.territoryTiles.clear();
      player.T = 0;
      player.E = 0;
      player.Ts = 0;
      player.Es = 0;
      deps.resourceCountsByPlayer.set(player.id, { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 });
      deps.clusterControlledTilesByPlayer.set(player.id, new Map());
    }

    for (const [tileKey, ownerId] of [...deps.ownership.entries()]) {
      if (ownerId === deps.BARBARIAN_OWNER_ID) {
        const [x, y] = deps.parseKey(tileKey);
        const tile = deps.playerTile(x, y);
        if (tile.terrain !== "LAND") {
          deps.ownership.delete(tileKey);
          deps.ownershipStateByTile.delete(tileKey);
          continue;
        }
        deps.ownershipStateByTile.set(tileKey, "BARBARIAN");
        continue;
      }
      const player = deps.players.get(ownerId);
      if (!player) {
        deps.ownership.delete(tileKey);
        continue;
      }
      const [x, y] = deps.parseKey(tileKey);
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND") {
        deps.ownership.delete(tileKey);
        deps.ownershipStateByTile.delete(tileKey);
        continue;
      }
      if (!deps.ownershipStateByTile.has(tileKey)) deps.ownershipStateByTile.set(tileKey, "SETTLED");
      if (deps.ownershipStateByTile.get(tileKey) === "SETTLED" && !deps.settledSinceByTile.has(tileKey)) {
        deps.settledSinceByTile.set(tileKey, 0);
      }
      player.territoryTiles.add(tileKey);
      player.T += 1;
      if (tile.resource) deps.getOrInitResourceCounts(ownerId)[tile.resource] = (deps.getOrInitResourceCounts(ownerId)[tile.resource] ?? 0) + 1;
      if (tile.clusterId) deps.setClusterControlDelta(ownerId, tile.clusterId, 1);
    }

    for (const player of deps.players.values()) {
      deps.recomputeExposure(player);
      deps.ensureFallbackSettlementForPlayer(player.id);
      deps.recomputeTownNetworkForPlayer(player.id);
      deps.reconcileCapitalForPlayer(player);
      deps.updateMissionState(player);
    }
    for (const agent of [...deps.barbarianAgents.values()]) {
      const tile = deps.playerTile(agent.x, agent.y);
      if (tile.ownerId !== deps.BARBARIAN_OWNER_ID || tile.terrain !== "LAND") {
        deps.removeBarbarianAgent(agent.id);
        continue;
      }
      deps.upsertBarbarianAgent(agent);
    }
  };

  const spawnPlayer = (player: Player): void => {
    const hasNearbyPlayerSpawn = (x: number, y: number, radius: number): boolean => {
      for (const other of deps.players.values()) {
        if (other.id === player.id) continue;
        const home = deps.playerHomeTile(other);
        const spawnOrigin = other.spawnOrigin;
        const [ox, oy] = home ? [home.x, home.y] : spawnOrigin ? deps.parseKey(spawnOrigin) : [Number.NaN, Number.NaN];
        if (Number.isNaN(ox) || Number.isNaN(oy)) continue;
        if (deps.chebyshevDistance(x, y, ox, oy) < radius) return true;
      }
      return false;
    };

    const hasNearbyTown = (x: number, y: number, radius: number): boolean => {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
          if (deps.townsByTile.has(deps.key(deps.wrapX(x + dx, deps.WORLD_WIDTH), deps.wrapY(y + dy, deps.WORLD_HEIGHT)))) return true;
        }
      }
      return false;
    };

    const hasNearbyFood = (x: number, y: number, radius: number): boolean => {
      for (let dy = -radius; dy <= radius; dy += 1) {
        for (let dx = -radius; dx <= radius; dx += 1) {
          if (Math.abs(dx) + Math.abs(dy) > radius) continue;
          const tileKey = deps.key(deps.wrapX(x + dx, deps.WORLD_WIDTH), deps.wrapY(y + dy, deps.WORLD_HEIGHT));
          const clusterId = deps.clusterByTile.get(tileKey);
          const cluster = clusterId ? deps.clustersById.get(clusterId) : undefined;
          if (!cluster) continue;
          const resource = deps.clusterResourceType(cluster);
          if (resource === "FARM" || resource === "FISH") return true;
        }
      }
      return false;
    };

    const trySpawnAt = (x: number, y: number): boolean => {
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND") return false;
      if (deps.townsByTile.has(deps.key(x, y))) return false;
      if (tile.ownerId && tile.ownerId !== deps.BARBARIAN_OWNER_ID) return false;
      deps.updateOwnership(x, y, player.id, "SETTLED");
      if (!deps.townsByTile.has(deps.key(x, y))) deps.createSettlementAtTile(player.id, deps.key(x, y));
      player.spawnOrigin = deps.key(x, y);
      player.capitalTileKey = deps.key(x, y);
      deps.sendVisibleTileDeltaAt(x, y);
      player.spawnShieldUntil = deps.now() + 120_000;
      player.isEliminated = false;
      player.respawnPending = false;
      deps.broadcastBulk({ type: "PLAYER_STYLE", playerId: player.id, ...deps.playerStylePayload(player) });
      deps.runtimeLogInfo({ playerId: player.id, x, y }, "spawned player");
      return true;
    };

    if (!player.isAi && deps.DEBUG_SPAWN_NEAR_AI) {
      for (const other of deps.players.values()) {
        if (!other.isAi) continue;
        const home = deps.playerHomeTile(other);
        const spawnOrigin = other.spawnOrigin;
        const [ox, oy] = home ? [home.x, home.y] : spawnOrigin ? deps.parseKey(spawnOrigin) : [Number.NaN, Number.NaN];
        if (Number.isNaN(ox) || Number.isNaN(oy)) continue;
        for (const [nxRaw, nyRaw] of [[ox, oy - 1], [ox + 1, oy], [ox, oy + 1], [ox - 1, oy]] as [number, number][]) {
          if (trySpawnAt(deps.wrapX(nxRaw, deps.WORLD_WIDTH), deps.wrapY(nyRaw, deps.WORLD_HEIGHT))) return;
        }
      }
    }

    for (let i = 0; i < 8_000; i += 1) {
      const x = Math.floor(Math.random() * deps.WORLD_WIDTH);
      const y = Math.floor(Math.random() * deps.WORLD_HEIGHT);
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND" || tile.ownerId) continue;
      if (hasNearbyPlayerSpawn(x, y, 50) || !hasNearbyTown(x, y, 10) || !hasNearbyFood(x, y, 10)) continue;
      if (trySpawnAt(x, y)) return;
    }

    for (let i = 0; i < 5_000; i += 1) {
      const x = Math.floor(Math.random() * deps.WORLD_WIDTH);
      const y = Math.floor(Math.random() * deps.WORLD_HEIGHT);
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND" || tile.ownerId) continue;
      if (hasNearbyPlayerSpawn(x, y, 50) || !hasNearbyTown(x, y, 10)) continue;
      if (trySpawnAt(x, y)) return;
    }

    for (let i = 0; i < 5_000; i += 1) {
      const x = Math.floor(Math.random() * deps.WORLD_WIDTH);
      const y = Math.floor(Math.random() * deps.WORLD_HEIGHT);
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND" || tile.ownerId) continue;
      if (hasNearbyPlayerSpawn(x, y, 50) || !hasNearbyFood(x, y, 10)) continue;
      if (trySpawnAt(x, y)) return;
    }

    for (let i = 0; i < 5_000; i += 1) {
      const x = Math.floor(Math.random() * deps.WORLD_WIDTH);
      const y = Math.floor(Math.random() * deps.WORLD_HEIGHT);
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND" || hasNearbyPlayerSpawn(x, y, 50)) continue;
      if (!tile.ownerId && trySpawnAt(x, y)) return;
    }

    for (let i = 0; i < 20_000; i += 1) {
      const x = Math.floor(Math.random() * deps.WORLD_WIDTH);
      const y = Math.floor(Math.random() * deps.WORLD_HEIGHT);
      const tile = deps.playerTile(x, y);
      if (tile.terrain !== "LAND" || tile.ownerId !== deps.BARBARIAN_OWNER_ID) continue;
      if (trySpawnAt(x, y)) return;
    }

    for (let y = 0; y < deps.WORLD_HEIGHT; y += 1) {
      for (let x = 0; x < deps.WORLD_WIDTH; x += 1) {
        if (trySpawnAt(x, y)) return;
      }
    }

    deps.runtimeLogError({ playerId: player.id }, "failed to find any land tile for spawn");
  };

  const getOrCreatePlayerForIdentity = (identity: AuthIdentity): Player | undefined => {
    let player = deps.players.get(identity.playerId);
    if (!player) {
      player = {
        id: crypto.randomUUID(),
        name: identity.name,
        profileComplete: false,
        points: deps.STARTING_GOLD,
        level: 0,
        techIds: new Set<string>(),
        domainIds: new Set<string>(),
        mods: { attack: 1, defense: 1, income: 1, vision: 1 },
        powerups: {},
        tileColor: deps.colorFromId(identity.name),
        missions: [],
        missionStats: deps.defaultMissionStats(),
        territoryTiles: new Set<TileKey>(),
        T: 0,
        E: 0,
        Ts: 0,
        Es: 0,
        stamina: deps.STAMINA_MAX,
        staminaUpdatedAt: deps.now(),
        manpower: deps.STARTING_MANPOWER,
        manpowerUpdatedAt: deps.now(),
        manpowerCapSnapshot: deps.STARTING_MANPOWER,
        allies: new Set<string>(),
        spawnShieldUntil: deps.now() + 120_000,
        isEliminated: false,
        respawnPending: false,
        lastActiveAt: deps.now(),
        lastEconomyWakeAt: deps.now(),
        activityInbox: []
      };
      deps.players.set(player.id, player);
      identity.playerId = player.id;
      deps.playerBaseMods.set(player.id, { attack: 1, defense: 1, income: 1, vision: 1 });
      deps.strategicResourceStockByPlayer.set(player.id, deps.emptyStrategicStocks());
      deps.strategicResourceBufferByPlayer.set(player.id, deps.emptyStrategicStocks());
      deps.economyIndexByPlayer.set(player.id, deps.emptyPlayerEconomyIndex());
      deps.dynamicMissionsByPlayer.set(player.id, []);
      deps.forcedRevealTilesByPlayer.set(player.id, new Set<TileKey>());
      deps.setRevealTargetsForPlayer(player.id, []);
      deps.playerEffectsByPlayer.set(player.id, deps.emptyPlayerEffects());
      spawnPlayer(player);
    }
    if (!player) return undefined;
    if (!Array.isArray(player.activityInbox)) player.activityInbox = [];
    if (!(player.domainIds instanceof Set)) (player as Player & { domainIds: Set<string> }).domainIds = new Set<string>();
    deps.normalizePlayerProgressionState(player);
    if (player.T <= 0 || player.territoryTiles.size === 0) spawnPlayer(player);
    if (!player.tileColor) player.tileColor = deps.colorFromId(player.id);
    if (player.name !== identity.name) player.name = identity.name;
    deps.recomputePlayerEffectsForPlayer(player);
    deps.ensureMissionDefaults(player);
    deps.updateMissionState(player);
    return player;
  };

  return {
    serializePlayer,
    lastEconomyActivityAtForPlayer,
    offlineUpkeepPausedForPlayer,
    wakeOfflineEconomyForPlayer,
    queueOfflinePlayerActivity,
    consumeOfflinePlayerActivity,
    playerActivityName,
    queueOfflineTownCaptureActivity,
    rebuildOwnershipDerivedState,
    spawnPlayer,
    getOrCreatePlayerForIdentity
  };
};
