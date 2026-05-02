import { describe, expect, it } from "vitest";
import type { Player, Tile, TileKey } from "@border-empires/shared";
import { createServerPlayerRuntimeSupport, type CreateServerPlayerRuntimeSupportDeps } from "./server-player-runtime-support.js";
import { emptyPlayerEffects } from "./server-effects.js";
import type { AuthIdentity } from "./server-auth.js";

const makeDeps = (): CreateServerPlayerRuntimeSupportDeps => {
  const players = new Map<string, Player>();
  const ownership = new Map<TileKey, string>();
  const ownershipStateByTile = new Map<TileKey, Tile["ownershipState"]>();
  const townsByTile = new Map<TileKey, { tileKey: TileKey; townId: string; type: "MARKET" | "FARMING"; population: number; maxPopulation: number; connectedTownCount: number; connectedTownBonus: number; lastGrowthTickAt: number }>();
  const resourceCountsByPlayer = new Map<string, Record<string, number>>();
  const tiles = new Map<TileKey, Tile>([
    ["0,0", { x: 0, y: 0, terrain: "LAND", lastChangedAt: 0 }],
    ["1,0", { x: 1, y: 0, terrain: "LAND", lastChangedAt: 0 }]
  ]);
  const key = (x: number, y: number): TileKey => `${x},${y}`;
  const parseKey = (tileKey: TileKey): [number, number] => {
    const [xRaw, yRaw] = tileKey.split(",");
    return [Number(xRaw), Number(yRaw)];
  };

  return {
    players,
    ownership,
    ownershipStateByTile,
    settledSinceByTile: new Map(),
    townsByTile: townsByTile as CreateServerPlayerRuntimeSupportDeps["townsByTile"],
    clusterByTile: new Map(),
    clustersById: new Map(),
    resourceCountsByPlayer,
    clusterControlledTilesByPlayer: new Map(),
    barbarianAgents: new Map(),
    strategicResourceStockByPlayer: new Map(),
    strategicResourceBufferByPlayer: new Map(),
    economyIndexByPlayer: new Map(),
    dynamicMissionsByPlayer: new Map(),
    forcedRevealTilesByPlayer: new Map(),
    playerEffectsByPlayer: new Map(),
    playerBaseMods: new Map(),
    socketsByPlayer: new Map(),
    BARBARIAN_OWNER_ID: "barbarians",
    WORLD_WIDTH: 2,
    WORLD_HEIGHT: 1,
    DEBUG_SPAWN_NEAR_AI: false,
    STARTING_GOLD: 100,
    STARTING_MANPOWER: 10,
    STAMINA_MAX: 5,
    OFFLINE_YIELD_ACCUM_MAX_MS: 60_000,
    colorFromId: (id: string) => `#${id.slice(0, 6).padEnd(6, "0")}`,
    playerStylePayload: () => ({}),
    defaultMissionStats: () => ({
      enemyCaptures: 0,
      neutralCaptures: 0,
      combatWins: 0,
      maxTilesHeld: 0,
      maxSettledTilesHeld: 0,
      maxFarmsHeld: 0,
      maxContinentsHeld: 0,
      maxTechPicks: 0
    }),
    emptyStrategicStocks: () => ({ FOOD: 0, IRON: 0, CRYSTAL: 0, SUPPLY: 0, SHARD: 0, OIL: 0 }),
    emptyPlayerEconomyIndex: () => ({}),
    emptyPlayerEffects,
    setRevealTargetsForPlayer: () => {},
    recomputePlayerEffectsForPlayer: () => {},
    ensureMissionDefaults: () => {},
    normalizePlayerProgressionState: () => {},
    recomputeExposure: () => {},
    ensureActiveSettlementForPlayer: () => {},
    ensureFallbackSettlementForPlayer: () => {},
    recomputeTownNetworkForPlayer: () => {},
    reconcileCapitalForPlayer: () => {},
    updateMissionState: () => {},
    removeBarbarianAgent: () => {},
    upsertBarbarianAgent: () => {},
    playerHomeTile: (player) => {
      if (!player.spawnOrigin) return undefined;
      const [x, y] = parseKey(player.spawnOrigin);
      return { x, y };
    },
    playerTile: (x, y) => tiles.get(key(x, y)) ?? { x, y, terrain: "SEA", lastChangedAt: 0 },
    updateOwnership: (x, y, newOwner, newState) => {
      const tileKey = key(x, y);
      const tile = tiles.get(tileKey);
      if (!tile) return;
      if (newOwner) tile.ownerId = newOwner;
      else delete tile.ownerId;
      if (newState) tile.ownershipState = newState;
      else delete tile.ownershipState;
      if (newOwner) ownership.set(tileKey, newOwner);
      else ownership.delete(tileKey);
      if (newState) ownershipStateByTile.set(tileKey, newState);
      else ownershipStateByTile.delete(tileKey);
    },
    createSettlementAtTile: (_playerId, tileKey) => {
      townsByTile.set(tileKey, {
        tileKey,
        townId: `town-${townsByTile.size}`,
        type: "FARMING",
        population: 8_000,
        maxPopulation: 10_000,
        connectedTownCount: 0,
        connectedTownBonus: 0,
        lastGrowthTickAt: 1_000
      });
    },
    sendVisibleTileDeltaAt: () => {},
    broadcastBulk: () => {},
    clusterResourceType: () => "FARM",
    key,
    parseKey,
    wrapX: (x, width) => ((x % width) + width) % width,
    wrapY: (y, height) => ((y % height) + height) % height,
    chebyshevDistance: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)),
    getOrInitResourceCounts: (playerId) => {
      let counts = resourceCountsByPlayer.get(playerId);
      if (!counts) {
        counts = { FARM: 0, FISH: 0, FUR: 0, WOOD: 0, IRON: 0, GEMS: 0, OIL: 0 };
        resourceCountsByPlayer.set(playerId, counts);
      }
      return counts;
    },
    setClusterControlDelta: () => {},
    recordPlayerLifecycleEvent: () => {},
    now: () => 1_000,
    runtimeLogInfo: () => {},
    runtimeLogError: () => {}
  };
};

describe("auth identity player binding regression", () => {
  it("does not reuse an existing completed player just because a new identity shares the same name", () => {
    const deps = makeDeps();
    const runtime = createServerPlayerRuntimeSupport(deps);

    const firstIdentity: AuthIdentity = { uid: "uid-1", playerId: "", name: "SameName", email: "one@example.com" };
    const firstPlayer = runtime.getOrCreatePlayerForIdentity(firstIdentity);
    expect(firstPlayer).toBeDefined();
    if (!firstPlayer) return;
    firstPlayer.profileComplete = true;

    const secondIdentity: AuthIdentity = { uid: "uid-2", playerId: "", name: "SameName", email: "two@example.com" };
    const secondPlayer = runtime.getOrCreatePlayerForIdentity(secondIdentity);

    expect(secondPlayer).toBeDefined();
    expect(secondPlayer?.id).not.toBe(firstPlayer.id);
    expect(secondPlayer?.profileComplete).toBe(false);
    expect(secondIdentity.playerId).toBe(secondPlayer?.id);
  });

  it("records lifecycle incidents when an identity points at a missing player and a fresh player is created", () => {
    const deps = makeDeps();
    const lifecycleEvents: Array<{ event: string; payload: Record<string, unknown> }> = [];
    deps.recordPlayerLifecycleEvent = (event, payload) => {
      lifecycleEvents.push({ event, payload });
    };
    const runtime = createServerPlayerRuntimeSupport(deps);

    const identity: AuthIdentity = {
      uid: "uid-3",
      playerId: "missing-player",
      name: "Recovered",
      email: "recover@example.com"
    };

    const player = runtime.getOrCreatePlayerForIdentity(identity);

    expect(player).toBeDefined();
    expect(lifecycleEvents.map((entry) => entry.event)).toEqual([
      "auth_identity_missing_player_binding",
      "auth_identity_created_player",
      "player_spawned",
      "auth_identity_triggered_respawn",
      "player_spawned"
    ]);
    expect(lifecycleEvents[0]?.payload.playerId).toBe("missing-player");
    expect(lifecycleEvents[1]?.payload.playerId).toBe(player?.id);
  });

  it("marks pending offline eliminations as eliminated respawns during login recovery", () => {
    const deps = makeDeps();
    const runtime = createServerPlayerRuntimeSupport(deps);

    const identity: AuthIdentity = {
      uid: "uid-elim",
      playerId: "player-elim",
      name: "Respawned",
      email: "respawn@example.com"
    };

    const player: Player = {
      id: "player-elim",
      name: "Respawned",
      profileComplete: true,
      points: 100,
      level: 0,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      powerups: {},
      tileColor: "#123456",
      missions: [],
      missionStats: deps.defaultMissionStats(),
      territoryTiles: new Set<TileKey>(),
      T: 0,
      E: 4,
      Ts: 0,
      Es: 4,
      stamina: deps.STAMINA_MAX,
      staminaUpdatedAt: deps.now(),
      manpower: deps.STARTING_MANPOWER,
      manpowerUpdatedAt: deps.now(),
      manpowerCapSnapshot: deps.STARTING_MANPOWER,
      allies: new Set<string>(),
      spawnOrigin: "0,0",
      spawnShieldUntil: deps.now(),
      isEliminated: true,
      respawnPending: true,
      lastActiveAt: deps.now(),
      lastEconomyWakeAt: deps.now(),
      activityInbox: []
    };
    deps.players.set(player.id, player);

    runtime.getOrCreatePlayerForIdentity(identity);
    const notice = runtime.consumeRespawnNoticeForPlayer(player);

    expect(notice?.reasonCode).toBe("eliminated");
    expect(notice?.triggerEvent).toBe("auth_identity_triggered_respawn");
  });

  it("marks broken completed empires as auth recovery respawns during login recovery", () => {
    const deps = makeDeps();
    const runtime = createServerPlayerRuntimeSupport(deps);

    const identity: AuthIdentity = {
      uid: "uid-auth",
      playerId: "player-auth",
      name: "Respawned",
      email: "respawn@example.com"
    };

    const player: Player = {
      id: "player-auth",
      name: "Respawned",
      profileComplete: true,
      points: 100,
      level: 0,
      techIds: new Set<string>(),
      domainIds: new Set<string>(),
      mods: { attack: 1, defense: 1, income: 1, vision: 1 },
      powerups: {},
      tileColor: "#123456",
      missions: [],
      missionStats: deps.defaultMissionStats(),
      territoryTiles: new Set<TileKey>(["0,0"]),
      T: 0,
      E: 4,
      Ts: 0,
      Es: 4,
      stamina: deps.STAMINA_MAX,
      staminaUpdatedAt: deps.now(),
      manpower: deps.STARTING_MANPOWER,
      manpowerUpdatedAt: deps.now(),
      manpowerCapSnapshot: deps.STARTING_MANPOWER,
      allies: new Set<string>(),
      spawnOrigin: "0,0",
      spawnShieldUntil: deps.now(),
      isEliminated: false,
      respawnPending: false,
      lastActiveAt: deps.now(),
      lastEconomyWakeAt: deps.now(),
      activityInbox: []
    };
    deps.players.set(player.id, player);

    runtime.getOrCreatePlayerForIdentity(identity);
    const notice = runtime.consumeRespawnNoticeForPlayer(player);

    expect(notice?.reasonCode).toBe("auth_recovery");
    expect(notice?.summary).toContain("playable foothold");
  });

  it("consumes respawn notices after first delivery and does not snapshot them", () => {
    const deps = makeDeps();
    const runtime = createServerPlayerRuntimeSupport(deps);

    const identity: AuthIdentity = {
      uid: "uid-4",
      playerId: "",
      name: "Respawned",
      email: "respawn@example.com"
    };

    const player = runtime.getOrCreatePlayerForIdentity(identity);
    expect(player).toBeDefined();
    if (!player) return;

    player.territoryTiles.clear();
    player.T = 0;
    player.E = 4;
    player.spawnOrigin = "0,0";
    runtime.preparePlayerRespawnNotice(player, "auth_recovery", "auth_identity_triggered_respawn");
    runtime.spawnPlayer(player);

    const firstDelivery = runtime.consumeRespawnNoticeForPlayer(player);
    const secondDelivery = runtime.consumeRespawnNoticeForPlayer(player);
    const serialized = runtime.serializePlayer(player);

    expect(firstDelivery?.triggerEvent).toBe("auth_identity_triggered_respawn");
    expect(secondDelivery).toBeUndefined();
    expect("lastRespawnNotice" in serialized).toBe(false);
  });
});
