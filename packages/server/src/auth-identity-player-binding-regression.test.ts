import { describe, expect, it } from "vitest";
import type { Player, Tile, TileKey } from "@border-empires/shared";
import { createServerPlayerRuntimeSupport, type CreateServerPlayerRuntimeSupportDeps } from "./server-player-runtime-support.js";
import { emptyPlayerEffects } from "./server-effects.js";
import type { AuthIdentity } from "./server-auth.js";

const makeDeps = (): CreateServerPlayerRuntimeSupportDeps => {
  const players = new Map<string, Player>();
  const ownership = new Map<TileKey, string>();
  const ownershipStateByTile = new Map<TileKey, Tile["ownershipState"]>();
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
    townsByTile: new Map(),
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
    createSettlementAtTile: () => {},
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
});
