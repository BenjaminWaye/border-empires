import { beforeEach, describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "./client-network.js";
import { CAMERA_LOCATION_STORAGE_KEY } from "../client-constants.js";

// Regression: when a new season starts the server broadcasts SEASON_ROLLOVER.
// The old code cleared tiles, render caches, and victory state, but never
// removed the persisted camera location from localStorage. On the next page
// load the stale coordinates were restored and the player saw darkness.
// This proves the handler now removes the stored camera location.

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

let storage: Map<string, string>;

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
    tiles: new Map(),
    incomingAttacksByTile: new Map(),
    outgoingMusterAttacksByTile: new Map(),
    revealedPredictedCombatByKey: new Map(),
    activeTruces: [],
    incomingTruceRequests: [],
    activeAetherBridges: [],
    seasonVictory: [],
    seasonWinner: undefined,
    seasonEndDismissed: false,
    seasonEndStarting: false,
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
    zoom: 22,
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
    autoBuildTargets: new Map<string, unknown>(),
    attackPreviewPendingKey: "",
    attackPreview: undefined,
    attackPreviewCacheByKey: new Map(),
    capture: undefined,
    pendingShardCollect: undefined,
    dockRouteCache: new Map(),
    victoryHoldAlert: undefined,
    victoryHoldAlertCollapsed: false,
    acknowledgedVictoryHoldAlertKeys: new Set<string>()
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
    defensibilityPctFromTE: vi.fn(),
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
    explainActionFailure: vi.fn(),
    notifyInsufficientGoldForFrontierAction: vi.fn(),
    clearSettlementProgressByKey: vi.fn(),
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    settlementProgressForTile: vi.fn(() => undefined),
    ...overrides
  } as any);
};

describe("SEASON_ROLLOVER clears persisted camera location", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    storage = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => storage.set(key, value),
        removeItem: (key: string) => storage.delete(key)
      }
    });
  });

  it("removes the camera location from localStorage on SEASON_ROLLOVER", () => {
    // Simulate a saved camera location from the old season.
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40 }));
    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(true);

    const state = createState();
    const ws = new FakeWebSocket();
    bindDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({ type: "SEASON_ROLLOVER", season: { worldSeed: 12345, mapStyle: "continents" } })
    });

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(false);
  });

  it("does not clear camera location on other message types", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40 }));

    const state = createState();
    const ws = new FakeWebSocket();
    bindDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({ type: "TILE_DELTA", tiles: [] })
    });

    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(true);
  });

  it("resets camera position in state on SEASON_ROLLOVER", () => {
    storage.set(CAMERA_LOCATION_STORAGE_KEY, JSON.stringify({ x: 500, y: 300, zoom: 40 }));

    const state = createState();
    state.camX = 500;
    state.camY = 300;
    state.zoom = 40;
    const ws = new FakeWebSocket();
    bindDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({ type: "SEASON_ROLLOVER", season: { worldSeed: 12345, mapStyle: "continents" } })
    });

    expect(state.camX).toBe(0);
    expect(state.camY).toBe(0);
    expect(storage.has(CAMERA_LOCATION_STORAGE_KEY)).toBe(false);
  });
});
