import { afterEach, describe, expect, it, vi } from "vitest";

import type { Player, TileKey } from "@border-empires/shared";

import { createServerRealtimeSyncRuntime } from "./server-realtime-sync-runtime.js";

const buildPlayer = (id: string): Player =>
  ({
    id,
    name: id,
    color: "#fff",
    level: 1,
    points: 0,
    gold: 0,
    stamina: 100,
    manpower: 100,
    manpowerCap: 100,
    manpowerRegenPerMinute: 0,
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    territoryTiles: new Set<TileKey>(),
    allies: new Set<string>(),
    missionStats: { neutralCaptures: 0, enemyCaptures: 0, combatWins: 0 },
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    revealTargets: new Set<string>(),
    availableTechPicks: 0,
    activity: [],
    isAi: false,
    spawnShieldUntil: 0,
    lastActiveAt: 0
  }) as unknown as Player;

describe("server realtime sync runtime", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("defers subscribed chunk refreshes while human frontier priority is active", () => {
    vi.useFakeTimers();

    const player = buildPlayer("p1");
    const socket = {
      OPEN: 1,
      readyState: 1,
      send: vi.fn(),
      bufferedAmount: 0
    };
    const sendChunkSnapshot = vi.fn();
    const recordServerDebugEvent = vi.fn();
    const pendingChunkRefreshByPlayer = new Set<string>();
    let humanPriorityActive = true;

    const runtime = createServerRealtimeSyncRuntime({
      WORLD_WIDTH: 64,
      WORLD_HEIGHT: 64,
      OBSERVATORY_VISION_BONUS: 0,
      TILE_SYNC_DEBUG: false,
      TILE_SYNC_DEBUG_EMAILS: new Set<string>(),
      players: new Map([[player.id, player]]),
      authIdentityByUid: new Map(),
      socketsByPlayer: new Map([[player.id, socket as never]]),
      bulkSocketsByPlayer: new Map([[player.id, socket as never]]),
      chunkSubscriptionByPlayer: new Map([[player.id, { cx: 0, cy: 0, radius: 1 }]]),
      chunkSnapshotInFlightByPlayer: new Map(),
      pendingChunkRefreshByPlayer,
      townsByTile: new Map(),
      docksByTile: new Map(),
      clusterByTile: new Map(),
      clustersById: new Map(),
      victoryPressureById: new Map(),
      now: () => Date.now(),
      key: (x, y) => `${x},${y}`,
      parseKey: (tileKey) => {
        const [xText, yText] = tileKey.split(",");
        return [Number(xText), Number(yText)];
      },
      wrapX: (value, mod) => ((value % mod) + mod) % mod,
      wrapY: (value, mod) => ((value % mod) + mod) % mod,
      terrainAtRuntime: () => "LAND",
      activeSettlementTileKeyForPlayer: () => undefined,
      ownedTownKeysForPlayer: () => [],
      playerTile: (x, y) => ({ x, y, terrain: "LAND", fogged: false, lastChangedAt: 0 }),
      recordDiscoveredTilesForPlayer: () => false,
      tileInSubscription: () => true,
      sendChunkSnapshot,
      visibilitySnapshotForPlayer: () => ({ allVisible: true, visibleMask: new Uint8Array(0) }),
      visibleInSnapshot: () => true,
      visible: () => true,
      effectiveVisionRadiusForPlayer: () => 2,
      humanFrontierActionPriorityActive: () => humanPriorityActive,
      isValidCapitalTile: (_player, tileKey): tileKey is TileKey => Boolean(tileKey),
      chooseCapitalTileKey: () => undefined,
      resolveControlSocketForPlayer: (controlSockets, playerId) => controlSockets.get(playerId),
      resolveBulkSocketForPlayer: (_controlSockets, bulkSockets, playerId) => bulkSockets.get(playerId),
      sendBulkPayloadToPlayer: vi.fn(),
      sendHighPrioritySocketMessage: vi.fn(),
      recordServerDebugEvent,
      appLogInfo: vi.fn()
    });

    runtime.refreshSubscribedViewForPlayer(player.id);

    expect(sendChunkSnapshot).not.toHaveBeenCalled();
    expect(pendingChunkRefreshByPlayer.has(player.id)).toBe(true);
    expect(recordServerDebugEvent).toHaveBeenCalledWith(
      "info",
      "subscribed_view_refresh_deferred_for_frontier_priority",
      expect.objectContaining({ playerId: player.id, deferredDelayMs: 50 })
    );

    humanPriorityActive = false;
    vi.advanceTimersByTime(50);

    expect(sendChunkSnapshot).toHaveBeenCalledTimes(1);
    expect(sendChunkSnapshot).toHaveBeenCalledWith(socket, player, { cx: 0, cy: 0, radius: 1 }, "realtime_refresh");
    expect(pendingChunkRefreshByPlayer.has(player.id)).toBe(false);
    expect(recordServerDebugEvent).toHaveBeenCalledWith(
      "info",
      "subscribed_view_refresh_flushed_after_frontier_priority",
      expect.objectContaining({ playerId: player.id, deferredMs: 50 })
    );
  });
});
