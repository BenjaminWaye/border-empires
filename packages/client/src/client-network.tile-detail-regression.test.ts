import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "./client-network.js";

class FakeWebSocket {
  static readonly OPEN = 1;

  readyState = FakeWebSocket.OPEN;
  readonly OPEN = FakeWebSocket.OPEN;
  private readonly listeners = new Map<string, Array<(event: any) => void>>();

  addEventListener(type: string, listener: (event: any) => void): void {
    const existing = this.listeners.get(type) ?? [];
    existing.push(listener);
    this.listeners.set(type, existing);
  }

  emit(type: string, event: any): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const createState = () =>
  ({
    authSessionReady: true,
    authReady: true,
    authBusy: false,
    authRetrying: false,
    authBusyTitle: "",
    authBusyDetail: "",
    selected: { x: 79, y: 240 },
    hover: undefined,
    pendingTechUnlockId: "",
    pendingDomainUnlockId: "",
    pendingCollectVisibleKeys: new Set<string>(),
    tiles: new Map([
      [
        "79,240",
        {
          x: 79,
          y: 240,
          terrain: "LAND",
          fogged: false,
          ownerId: "me",
          ownershipState: "SETTLED",
          detailLevel: "summary"
        }
      ]
    ]),
    incomingAttacksByTile: new Map(),
    revealedPredictedCombatByKey: new Map(),
    activeTruces: [],
    incomingTruceRequests: [],
    activeAetherBridges: [],
    seasonVictory: [],
    seasonWinner: undefined,
    leaderboard: {},
    playerNames: new Map(),
    playerColors: new Map(),
    playerVisualStyles: new Map(),
    playerShieldUntil: new Map(),
    pendingCollectTileDelta: new Map(),
    settleProgressByTile: new Map(),
    feed: [],
    developmentQueue: [],
    missions: [],
    me: "me",
    gold: 0,
    level: 1,
    mods: {},
    modBreakdown: {},
    incomePerMinute: 0,
    strategicResources: {},
    strategicProductionPerMinute: {},
    strategicAnim: {
      FOOD: { until: 0, dir: 0 },
      IRON: { until: 0, dir: 0 },
      CRYSTAL: { until: 0, dir: 0 },
      SUPPLY: { until: 0, dir: 0 },
      SHARD: { until: 0, dir: 0 },
      OIL: { until: 0, dir: 0 }
    },
    economyBreakdown: {},
    upkeepPerMinute: {},
    upkeepLastTick: { foodCoverage: 1 },
    stamina: 0,
    manpower: 0,
    manpowerCap: 0,
    manpowerRegenPerMinute: 0,
    manpowerBreakdown: {},
    territoryT: 0,
    exposureE: 0,
    settledT: 0,
    settledE: 0,
    defensibilityPct: 0,
    defensibilityAnimDir: 0,
    defensibilityAnimUntil: 0,
    availableTechPicks: 0,
    techChoices: [],
    techCatalog: [],
    currentResearch: undefined,
    domainIds: [],
    domainChoices: [],
    domainCatalog: [],
    revealCapacity: 0,
    activeRevealTargets: [],
    abilityCooldowns: {},
    incomingAllianceRequests: [],
    outgoingAllianceRequests: [],
    strategicReplayEvents: [],
    hasEverInitialized: true,
    connection: "initialized",
    mapLoadStartedAt: 1,
    firstChunkAt: 1,
    chunkFullCount: 0,
    hasOwnedTileInCache: false,
    discoveredTiles: new Set<string>(),
    discoveredDockTiles: new Set<string>(),
    tileDetailRequestedAt: new Map<string, number>(),
    lastChunkSnapshotGeneration: 0,
    lastSubAt: Date.now(),
    lastSubCx: 0,
    lastSubCy: 0,
    lastSubRadius: 2,
    camX: 0,
    camY: 0,
    fogDisabled: false,
    homeTile: undefined,
    profileSetupRequired: false,
    actionInFlight: false,
    actionStartedAt: 0,
    combatStartAck: false,
    actionTargetKey: "",
    actionCurrent: undefined,
    actionQueue: [],
    queuedTargetKeys: new Set<string>(),
    frontierSyncWaitUntilByTarget: new Map<string, number>(),
    frontierLateAckUntilByTarget: new Map<string, number>(),
    autoSettleTargets: new Set<string>(),
    attackPreviewPendingKey: "",
    attackPreview: undefined,
    attackPreviewCacheByKey: new Map(),
    capture: undefined
  }) as any;

describe("client network tile detail regression", () => {
  it("preserves nearby fort data when a summary TILE_DELTA omits fort fields", () => {
    const state = createState();
    state.tiles.set("79,236", {
      x: 79,
      y: 236,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary",
      fort: { ownerId: "me", status: "active" }
    });
    const ws = new FakeWebSocket();

    bindClientNetwork({
      state,
      ws: ws as unknown as WebSocket,
      wsUrl: "ws://localhost:3001/ws",
      keyFor: (x: number, y: number) => `${x},${y}`,
      renderHud: vi.fn(),
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      authenticateSocket: vi.fn(async () => {}),
      pushFeed: vi.fn(),
      pushFeedEntry: vi.fn(),
      clearOptimisticTileState: vi.fn(),
      requestViewRefresh: vi.fn(),
      applyPendingSettlementsFromServer: vi.fn(),
      mergeIncomingTileDetail: vi.fn((existing, incoming) => incoming ?? existing),
      mergeServerTileWithOptimisticState: vi.fn((tile) => tile),
      maybeAnnounceShardSite: vi.fn(),
      markDockDiscovered: vi.fn(),
      centerOnOwnedTile: vi.fn(),
      authProfileNameEl: { value: "" },
      authProfileColorEl: { value: "" },
      defensibilityPctFromTE: vi.fn(() => 0),
      clearPendingCollectVisibleDelta: vi.fn(),
      seedProfileSetupFields: vi.fn(),
      resetStrategicReplayState: vi.fn(),
      setWorldSeed: vi.fn(),
      clearRenderCaches: vi.fn(),
      buildMiniMapBase: vi.fn(),
      shardAlertKeyForPayload: vi.fn(),
      showShardAlert: vi.fn(),
      combatResolutionAlert: vi.fn(),
      wasPredictedCombatAlreadyShown: vi.fn(() => false),
      showCaptureAlert: vi.fn(),
      requestSettlement: vi.fn(() => false),
      dropQueuedTargetKeyIfAbsent: vi.fn(),
      processActionQueue: vi.fn(() => false),
      clearSettlementProgressForTile: vi.fn(),
      terrainAt: vi.fn(() => "LAND"),
      requestTileDetailIfNeeded: vi.fn(),
      requestAttackPreviewForTarget: vi.fn(),
      openSingleTileActionMenu: vi.fn(),
      isTileOwnedByAlly: vi.fn(() => false),
      hideShardAlert: vi.fn(),
      explainActionFailure: vi.fn((code: string, message: string) => `${code}:${message}`),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      clearSettlementProgressByKey: vi.fn(),
      showCollectVisibleCooldownAlert: vi.fn(),
      formatCooldownShort: vi.fn(() => "1s"),
      reconcileActionQueue: vi.fn(),
      revertOptimisticVisibleCollectDelta: vi.fn(),
      revertOptimisticTileCollectDelta: vi.fn(),
      clearPendingCollectTileDelta: vi.fn(),
      playerNameForOwner: vi.fn(),
      settlementProgressForTile: vi.fn(() => undefined)
    } as any);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          {
            x: 79,
            y: 236,
            terrain: "LAND",
            fogged: false,
            ownerId: "me",
            ownershipState: "SETTLED",
            detailLevel: "summary"
          }
        ]
      })
    });

    expect(state.tiles.get("79,236")).toEqual(
      expect.objectContaining({
        detailLevel: "summary",
        fort: { ownerId: "me", status: "active" }
      })
    );
  });

  it("preserves upkeep entries from full TILE_DELTA updates", () => {
    const state = createState();
    const ws = new FakeWebSocket();

    bindClientNetwork({
      state,
      ws: ws as unknown as WebSocket,
      wsUrl: "ws://localhost:3001/ws",
      keyFor: (x: number, y: number) => `${x},${y}`,
      renderHud: vi.fn(),
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      authenticateSocket: vi.fn(async () => {}),
      pushFeed: vi.fn(),
      pushFeedEntry: vi.fn(),
      clearOptimisticTileState: vi.fn(),
      requestViewRefresh: vi.fn(),
      applyPendingSettlementsFromServer: vi.fn(),
      mergeIncomingTileDetail: vi.fn((existing, incoming) => incoming ?? existing),
      mergeServerTileWithOptimisticState: vi.fn((tile) => tile),
      maybeAnnounceShardSite: vi.fn(),
      markDockDiscovered: vi.fn(),
      centerOnOwnedTile: vi.fn(),
      authProfileNameEl: { value: "" },
      authProfileColorEl: { value: "" },
      defensibilityPctFromTE: vi.fn(() => 0),
      clearPendingCollectVisibleDelta: vi.fn(),
      seedProfileSetupFields: vi.fn(),
      resetStrategicReplayState: vi.fn(),
      setWorldSeed: vi.fn(),
      clearRenderCaches: vi.fn(),
      buildMiniMapBase: vi.fn(),
      shardAlertKeyForPayload: vi.fn(),
      showShardAlert: vi.fn(),
      combatResolutionAlert: vi.fn(),
      wasPredictedCombatAlreadyShown: vi.fn(() => false),
      showCaptureAlert: vi.fn(),
      requestSettlement: vi.fn(() => false),
      dropQueuedTargetKeyIfAbsent: vi.fn(),
      processActionQueue: vi.fn(() => false),
      clearSettlementProgressForTile: vi.fn(),
      terrainAt: vi.fn(() => "LAND"),
      requestTileDetailIfNeeded: vi.fn(),
      requestAttackPreviewForTarget: vi.fn(),
      openSingleTileActionMenu: vi.fn(),
      isTileOwnedByAlly: vi.fn(() => false),
      hideShardAlert: vi.fn(),
      explainActionFailure: vi.fn((code: string, message: string) => `${code}:${message}`),
      notifyInsufficientGoldForFrontierAction: vi.fn(),
      clearSettlementProgressByKey: vi.fn(),
      showCollectVisibleCooldownAlert: vi.fn(),
      formatCooldownShort: vi.fn(() => "1s"),
      reconcileActionQueue: vi.fn(),
      revertOptimisticVisibleCollectDelta: vi.fn(),
      revertOptimisticTileCollectDelta: vi.fn(),
      clearPendingCollectTileDelta: vi.fn(),
      playerNameForOwner: vi.fn()
      ,
      settlementProgressForTile: vi.fn(() => undefined)
    } as any);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          {
            x: 79,
            y: 240,
            terrain: "LAND",
            fogged: false,
            ownerId: "me",
            ownershipState: "SETTLED",
            detailLevel: "full",
            upkeepEntries: [{ label: "Settled land", perMinute: { GOLD: 0.04 } }]
          }
        ]
      })
    });

    expect(state.tiles.get("79,240")).toEqual(
      expect.objectContaining({
        detailLevel: "full",
        upkeepEntries: [{ label: "Settled land", perMinute: { GOLD: 0.04 } }]
      })
    );
  });
});
