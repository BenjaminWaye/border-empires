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
      SHARD: { until: 0, dir: 0 }
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
    outgoingTruceRequests: [],
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
    tileDetailReceivedAt: new Map<string, number>(),
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

// Shared binder for the new field-coverage tests below -- reduces the ~90
// line inline bindClientNetwork boilerplate the earlier tests in this file
// duplicate. Uses identity stubs for the two shared merge hooks so these
// tests exercise only the TILE_DELTA handler's own field-merge logic.
const bindTileDetailRegressionDeps = (state: any, ws: FakeWebSocket) => {
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
};

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

  it("accepts rewrite town payloads once population clears the renderable threshold", () => {
    // Town payloads are now accepted on population alone (>= 500) so foreign
    // towns under satellite reveal render with whatever public fields the
    // server sends. Owner-only economy fields stay undefined when absent and
    // the overview pane guards on hasOwnerEconomyData before showing them.
    const state = createState();
    state.tiles.set("80,240", {
      x: 80,
      y: 240,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary",
      resource: "FARM"
    });
    state.tiles.set("79,241", {
      x: 79,
      y: 241,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary",
      economicStructure: {
        ownerId: "me",
        type: "MARKET",
        status: "active"
      }
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
            y: 240,
            terrain: "LAND",
            fogged: false,
            ownerId: "me",
            ownershipState: "SETTLED",
            detailLevel: "full",
            townJson: JSON.stringify({
              name: "Qadarstrand",
              type: "MARKET",
              populationTier: "TOWN",
              population: 18_977,
              maxPopulation: 50_000,
              baseGoldPerMinute: 0,
              goldPerMinute: 0,
              cap: 0,
              isFed: false,
              connectedTownCount: 0,
              connectedTownBonus: 0,
              hasMarket: false,
              marketActive: false,
              hasGranary: false,
              granaryActive: false,
              hasBank: false,
              bankActive: false
            })
          }
        ]
      })
    });

    expect(state.tiles.get("79,240")).toEqual(
      expect.objectContaining({
        detailLevel: "full"
      })
    );
    expect(state.tiles.get("79,240")?.town?.population).toBe(18_977);
    expect(state.tiles.get("79,240")?.town?.populationTier).toBe("TOWN");
  });

  it("sets and clears breachShockUntil from TILE_DELTA updates", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindTileDetailRegressionDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary", breachShockUntil: 999_999 }]
      })
    });
    expect(state.tiles.get("79,240")?.breachShockUntil).toBe(999_999);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary", breachShockUntil: null }]
      })
    });
    expect(state.tiles.get("79,240")?.breachShockUntil).toBeUndefined();
  });

  it("sets and clears frontierDecayAt/frontierDecayKind from TILE_DELTA updates", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindTileDetailRegressionDeps(state, ws);

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
            ownershipState: "FRONTIER",
            detailLevel: "summary",
            frontierDecayAt: 555_000,
            frontierDecayKind: "NATURAL"
          }
        ]
      })
    });
    expect(state.tiles.get("79,240")?.frontierDecayAt).toBe(555_000);
    expect(state.tiles.get("79,240")?.frontierDecayKind).toBe("NATURAL");

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
            detailLevel: "summary",
            frontierDecayAt: null,
            frontierDecayKind: null
          }
        ]
      })
    });
    expect(state.tiles.get("79,240")?.frontierDecayAt).toBeUndefined();
    expect(state.tiles.get("79,240")?.frontierDecayKind).toBeUndefined();
  });

  it("sets clusterId/clusterType and the dock object field from TILE_DELTA updates (client-network-only fields)", () => {
    // Divergence pin: clusterId/clusterType/dock are only handled on the
    // TILE_DELTA path (client-network.ts) -- the gateway path has no
    // equivalent handling for these.
    const state = createState();
    const ws = new FakeWebSocket();
    bindTileDetailRegressionDeps(state, ws);

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
            detailLevel: "summary",
            clusterId: "cluster-1",
            clusterType: "ISLAND",
            dock: { ownerId: "me" }
          }
        ]
      })
    });

    expect(state.tiles.get("79,240")?.clusterId).toBe("cluster-1");
    expect(state.tiles.get("79,240")?.clusterType).toBe("ISLAND");
    expect(state.tiles.get("79,240")?.dock).toEqual({ ownerId: "me" });

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary", dock: null }]
      })
    });
    expect(state.tiles.get("79,240")?.dock).toBeUndefined();
  });

  it("only sets fogged when the update explicitly carries a fogged key (unlike the gateway path's unconditional derivation)", () => {
    const state = createState();
    state.tiles.set("79,240", {
      x: 79,
      y: 240,
      terrain: "LAND",
      fogged: true,
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary"
    });
    const ws = new FakeWebSocket();
    bindTileDetailRegressionDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary" }]
      })
    });

    // No `fogged` key on the update -- existing fogged: true must survive.
    expect(state.tiles.get("79,240")?.fogged).toBe(true);
  });

  it("never clears resource or dockId via delete -- an explicit falsy value is set as-is, not removed (divergence from gateway path)", () => {
    // Divergence pin: the TILE_DELTA handler merges resource/dockId with
    // `if (value !== undefined) merged.field = value;` -- it has no
    // delete-on-falsy branch. The gateway path (`applyGatewayTileUpdate`)
    // uses `if ("field" in update) { if (truthy) set; else delete; }`, which
    // DOES clear the field on an empty-string value. These are genuinely
    // different behaviors found while reading both blocks line-by-line; the
    // plan's "confirmed identical" list did not catch this, so it must NOT
    // be unified during extraction.
    const state = createState();
    state.tiles.set("79,240", {
      x: 79,
      y: 240,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "SETTLED",
      detailLevel: "summary",
      resource: "FARM",
      dockId: "dock-a"
    });
    const ws = new FakeWebSocket();
    bindTileDetailRegressionDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary", resource: "", dockId: "" }]
      })
    });

    const tile = state.tiles.get("79,240");
    expect(tile?.resource).toBe("");
    expect(tile?.dockId).toBe("");
  });
});
