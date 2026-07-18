import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "./client-network.js";

// Regression for a real Safari crash: the WS "message" listener used to have
// zero error containment of its own -- any throw during processing (a
// browser API restriction, a malformed payload, a bug in any branch)
// propagated straight out of the message dispatch uncaught, taking the whole
// client down. This proves the blanket try/catch added around the handler
// actually contains a throw instead of letting it escape.
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
    selected: undefined,
    hover: undefined,
    pendingTechUnlockId: "",
    pendingDomainUnlockId: "",
    pendingCollectVisibleKeys: new Set<string>(),
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

const bindDeps = (state: any, ws: FakeWebSocket, overrides: Record<string, unknown> = {}) => {
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
    settlementProgressForTile: vi.fn(() => undefined),
    ...overrides
  } as any);
};

describe("client network message handler error containment", () => {
  it("does not let a throw inside message processing escape the WS message listener", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    // renderHud is called by several branches (e.g. TILE_DELTA); make it
    // throw to simulate the class of Safari DOM/storage restriction behind
    // the real-world crashes this containment was added for.
    const throwingRenderHud = vi.fn(() => {
      throw new Error("simulated Safari DOM/storage failure");
    });

    bindDeps(state, ws, { renderHud: throwingRenderHud });

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({ type: "IMPERIAL_WARD_ACTIVATED", playerId: "me" })
      })
    ).not.toThrow();

    expect(throwingRenderHud).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      "[client-network] unhandled message processing error",
      expect.any(Error),
      expect.objectContaining({ msgType: "IMPERIAL_WARD_ACTIVATED" })
    );

    consoleErrorSpy.mockRestore();
  });

  it("does not throw when the incoming payload is not valid JSON", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    bindDeps(state, ws);

    expect(() => ws.emit("message", { data: "not json" })).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
