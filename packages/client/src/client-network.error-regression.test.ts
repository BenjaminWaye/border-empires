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
    pendingCollectVisibleKeys: new Set<string>(),
    actionTargetKey: "60,302",
    actionQueue: [],
    queuedTargetKeys: new Set<string>(),
    selected: { x: 61, y: 299 },
    hover: { x: 73, y: 305 },
    pendingTechUnlockId: "",
    pendingDomainUnlockId: "",
    latestSettleTargetKey: "12,18",
    authSessionReady: true,
    authBusy: false,
    authRetrying: false,
    authBusyTitle: "",
    authBusyDetail: "",
    collectVisibleCooldownUntil: 0,
    actionInFlight: true,
    capture: { startAt: 1, resolvesAt: 2, target: { x: 60, y: 302 } },
    pendingCombatReveal: undefined,
    combatStartAck: true,
    actionStartedAt: 123,
    actionCurrent: { x: 60, y: 302 },
    frontierSyncWaitUntilByTarget: new Map<string, number>(),
    autoSettleTargets: new Set<string>(["60,302"]),
    attackPreviewPendingKey: "60,302->61,302",
    attackPreview: { valid: true },
    attackPreviewCacheByKey: new Map<string, unknown>(),
    tiles: new Map(),
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
    settleProgressByTile: new Map([
      [
        "12,18",
        {
          startAt: 100,
          resolvesAt: Date.now() + 30_000,
          target: { x: 12, y: 18 },
          awaitingServerConfirm: false
        }
      ]
    ]),
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
    lastSubAt: Date.now(),
    lastSubCx: 0,
    lastSubCy: 0,
    lastSubRadius: 2,
    camX: 0,
    camY: 0,
    fogDisabled: false,
    homeTile: undefined
  }) as any;

const bindWithDeps = (state: any, ws: FakeWebSocket, overrides: Record<string, unknown> = {}) => {
  const renderHud = vi.fn();
  const requestViewRefresh = vi.fn();
  const clearOptimisticTileState = vi.fn();
  const dropQueuedTargetKeyIfAbsent = vi.fn();
  const reconcileActionQueue = vi.fn();
  const processActionQueue = vi.fn(() => false);
  const pushFeed = vi.fn();
  const applyPendingSettlementsFromServer = vi.fn();
  const requestTileDetailIfNeeded = vi.fn((tile: { x: number; y: number }) => {
    state.tileDetailRequestedAt.set(`${tile.x},${tile.y}`, Date.now());
  });

  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3001/ws",
    keyFor: (x: number, y: number) => `${x},${y}`,
    renderHud,
    setAuthStatus: vi.fn(),
    syncAuthOverlay: vi.fn(),
    authenticateSocket: vi.fn(async () => {}),
    pushFeed,
    pushFeedEntry: vi.fn(),
    clearOptimisticTileState,
    requestViewRefresh,
    applyPendingSettlementsFromServer,
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
    dropQueuedTargetKeyIfAbsent,
    processActionQueue,
    clearSettlementProgressForTile: vi.fn(),
    terrainAt: vi.fn(() => "LAND"),
    requestTileDetailIfNeeded,
    requestAttackPreviewForTarget: vi.fn(),
    openSingleTileActionMenu: vi.fn(),
    isTileOwnedByAlly: vi.fn(() => false),
    hideShardAlert: vi.fn(),
    explainActionFailure: vi.fn((code: string, message: string) => `${code}:${message}`),
    notifyInsufficientGoldForFrontierAction: vi.fn(),
    clearSettlementProgressByKey: vi.fn(),
    showCollectVisibleCooldownAlert: vi.fn(),
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue,
    revertOptimisticVisibleCollectDelta: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    settlementProgressForTile: vi.fn(() => undefined),
    COLLECT_VISIBLE_COOLDOWN_MS: 1_000,
    ...overrides
  } as any);

  return {
    requestViewRefresh,
    clearOptimisticTileState,
    reconcileActionQueue,
    applyPendingSettlementsFromServer,
    requestTileDetailIfNeeded
  };
};

describe("client network regression guards", () => {
  it("does not crash when the frontier reset policy function is missing", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "NOT_ADJACENT", message: "target must be enemy-controlled land" })
      })
    ).not.toThrow();
  });

  it("clears stuck frontier state on LOCKED errors and refreshes the tile immediately", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true)
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "LOCKED", message: "tile locked in combat" })
    });

    expect(state.actionInFlight).toBe(false);
    expect(state.actionTargetKey).toBe("");
    expect(state.actionCurrent).toBeUndefined();
    expect(state.capture).toBeUndefined();
    expect(state.combatStartAck).toBe(false);
    expect(state.frontierSyncWaitUntilByTarget.get("60,302")).toBeGreaterThan(Date.now());
    expect(state.lastSubAt).toBe(0);
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("60,302", true);
    expect(deps.reconcileActionQueue).toHaveBeenCalled();
  });

  it("does not clear active settlement progress when PLAYER_UPDATE omits pendingSettlements", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_UPDATE",
        gold: 10,
        points: 10,
        level: 1,
        stamina: 0
      })
    });

    expect(deps.applyPendingSettlementsFromServer).not.toHaveBeenCalled();
    expect(state.settleProgressByTile.get("12,18")?.target).toEqual({ x: 12, y: 18 });
    expect(state.latestSettleTargetKey).toBe("12,18");
  });

  it("requests full detail for newly visible owned summary tiles from chunk payloads", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "CHUNK_FULL",
        tilesMaskedByFog: [{ x: 5, y: 6, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary" }]
      })
    });

    expect(deps.requestTileDetailIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ x: 5, y: 6, ownerId: "me", detailLevel: "summary" })
    );
  });
});
