// Shared FakeWebSocket/createState/bindWithDeps test scaffolding for the
// client-network regression suites. Split out so client-network.error-regression.test.ts
// doesn't have to carry every new regression test file's fixture setup and keep growing
// past the repo's 500-line cap.
import { vi } from "vitest";
import { bindClientNetwork } from "./client-network.js";

export class FakeWebSocket {
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

export const createState = () =>
  ({
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
    actionInFlight: true,
    capture: { startAt: 1, resolvesAt: 2, target: { x: 60, y: 302 } },
    pendingCombatReveal: undefined,
    actionAcceptedAck: false,
    combatStartAck: true,
    actionStartedAt: 123,
    actionCurrent: { x: 60, y: 302 },
    frontierSyncWaitUntilByTarget: new Map<string, number>(),
    frontierLateAckUntilByTarget: new Map<string, number>(),
    autoSettleTargets: new Set<string>(["60,302"]), autoBuildTargets: new Map<string, string>([["60,302", "FARMSTEAD"]]),
    attackPreviewPendingKey: "60,302->61,302",
    attackPreview: { valid: true },
    attackPreviewCacheByKey: new Map<string, unknown>(),
    attackPreviewLatestRequestIdByKey: new Map<string, string>(),
    tiles: new Map(),
    incomingAttacksByTile: new Map(),
    outgoingMusterAttacksByTile: new Map(),
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
      TITANIUM: { until: 0, dir: 0 },
      CRYSTAL: { until: 0, dir: 0 },
      UMBRITE: { until: 0, dir: 0 },
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
    homeTile: undefined
  }) as any;

export const bindWithDeps = (state: any, ws: FakeWebSocket, overrides: Record<string, unknown> = {}) => {
  const renderHud = vi.fn();
  const requestViewRefresh = vi.fn();
  const clearOptimisticTileState = vi.fn();
  const clearSettlementProgressByKey = vi.fn();
  const dropQueuedTargetKeyIfAbsent = vi.fn();
  const reconcileActionQueue = vi.fn();
  const processActionQueue = vi.fn(() => false);
  const pushFeed = vi.fn();
  const applyOptimisticTileState = vi.fn((x: number, y: number, update: (tile: Record<string, unknown>) => void) => {
    const tileKey = `${x},${y}`;
    const current = state.tiles.get(tileKey) ?? { x, y, terrain: "LAND", fogged: false };
    const next = { ...current };
    update(next);
    state.tiles.set(tileKey, next);
  });
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
    applyOptimisticTileState,
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
    clearSettlementProgressByKey,
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue,
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    settlementProgressForTile: vi.fn(() => undefined),
    ...overrides
  } as any);

  return {
    pushFeed,
    requestViewRefresh,
    clearOptimisticTileState,
    applyOptimisticTileState,
    reconcileActionQueue,
    clearSettlementProgressByKey,
    applyPendingSettlementsFromServer,
    requestTileDetailIfNeeded,
    processActionQueue
  };
};

