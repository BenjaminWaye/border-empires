import { describe, expect, it, vi } from "vitest";
import { bindClientNetwork } from "./client-network.js";
import { explainActionFailureFromServer } from "./client-player-actions.js";

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
  const clearSettlementProgressByKey = vi.fn();
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
    clearSettlementProgressByKey,
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
    pushFeed,
    requestViewRefresh,
    clearOptimisticTileState,
    reconcileActionQueue,
    clearSettlementProgressByKey,
    applyPendingSettlementsFromServer,
    requestTileDetailIfNeeded,
    processActionQueue
  };
};

describe("client network regression guards", () => {
  it("does not crash when the frontier reset policy function is missing", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "ATTACK_TARGET_INVALID", message: "target must be enemy-controlled land" })
      })
    ).not.toThrow();
  });

  it("falls back to pushFeed when pushFeedEntry is missing during combat resolution", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const pushFeed = vi.fn();
    bindWithDeps(state, ws, {
      pushFeed,
      pushFeedEntry: undefined,
      combatResolutionAlert: vi.fn(() => ({
        title: "Victory",
        detail: "You captured the tile.",
        tone: "success"
      }))
    });

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({
          type: "COMBAT_RESULT",
          target: { x: 60, y: 302 },
          changes: [{ x: 60, y: 302, ownerId: "me", ownershipState: "FRONTIER" }]
        })
      })
    ).not.toThrow();
    expect(pushFeed).toHaveBeenCalledWith("You captured the tile.", "combat", "success");
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

  it("explains attack cooldown errors and applies only a short retry backoff", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true),
      explainActionFailure: vi.fn(explainActionFailureFromServer),
      formatCooldownShort: vi.fn((ms: number) => `${Math.ceil(ms / 1000)}s`)
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "ATTACK_COOLDOWN", message: "origin tile is still on attack cooldown", cooldownRemainingMs: 2_400 })
    });

    expect(state.actionInFlight).toBe(false);
    expect(state.actionTargetKey).toBe("");
    expect(state.actionCurrent).toBeUndefined();
    expect(state.capture).toBeUndefined();
    expect(state.combatStartAck).toBe(false);
    expect(state.frontierSyncWaitUntilByTarget.get("60,302")).toBeGreaterThan(Date.now());
    expect(state.frontierSyncWaitUntilByTarget.get("60,302")).toBeLessThanOrEqual(Date.now() + 3_500);
    expect(
      explainActionFailureFromServer("ATTACK_COOLDOWN", "origin tile is still on attack cooldown", {
        cooldownRemainingMs: 2_400,
        formatCooldownShort: (ms) => `${Math.ceil(ms / 1000)}s`
      })
    ).toBe(
      "Action blocked: that origin tile is still on attack cooldown for 3s."
    );
    expect(deps.pushFeed).toHaveBeenCalledWith("Action blocked: that origin tile is still on attack cooldown for 3s.", "error", "error");
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("60,302", true);
    expect(deps.reconcileActionQueue).toHaveBeenCalled();
  });

  it("explains invalid attack targets separately from adjacency failures", () => {
    expect(explainActionFailureFromServer("ATTACK_TARGET_INVALID", "target must be enemy-controlled land")).toBe(
      "Action blocked: target must be enemy-controlled land."
    );
    expect(explainActionFailureFromServer("NOT_ADJACENT", "target must be adjacent or valid dock crossing")).toBe(
      "Action blocked: target must border your territory or a linked dock."
    );
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

  it("clears stale barbarian ownership when an authoritative TILE_DELTA omits owner fields", () => {
    const state = createState();
    state.tiles.set("100,247", {
      x: 100,
      y: 247,
      terrain: "LAND",
      fogged: false,
      ownerId: "barbarian",
      ownershipState: "BARBARIAN",
      detailLevel: "summary",
      capital: true
    });
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 100, y: 247, fogged: false, detailLevel: "summary", regionType: "ANCIENT_HEARTLAND" }]
      })
    });

    expect(state.tiles.get("100,247")).toEqual(
      expect.objectContaining({
        x: 100,
        y: 247,
        regionType: "ANCIENT_HEARTLAND"
      })
    );
    expect(state.tiles.get("100,247")?.ownerId).toBeUndefined();
    expect(state.tiles.get("100,247")?.ownershipState).toBeUndefined();
    expect(state.tiles.get("100,247")?.capital).toBeUndefined();
  });

  it("resumes the frontier queue when a chunk refresh confirms a queued capture", () => {
    const state = createState();
    state.actionInFlight = false;
    state.capture = undefined;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.actionQueue = [
      { x: 100, y: 247, retries: 0 },
      { x: 101, y: 247, retries: 0 }
    ];
    state.queuedTargetKeys = new Set<string>(["100,247", "101,247"]);
    state.frontierSyncWaitUntilByTarget.set("100,247", Date.now() + 10_000);
    state.tiles.set("100,247", {
      x: 100,
      y: 247,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "expand"
    });
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "CHUNK_FULL",
        tilesMaskedByFog: [{ x: 100, y: 247, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "FRONTIER" }]
      })
    });

    expect(state.frontierSyncWaitUntilByTarget.has("100,247")).toBe(false);
    expect(state.actionQueue).toEqual([{ x: 101, y: 247, retries: 0 }]);
    expect(state.queuedTargetKeys.has("100,247")).toBe(false);
    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("100,247");
    expect(deps.processActionQueue).toHaveBeenCalled();
    expect(deps.requestTileDetailIfNeeded).toHaveBeenCalledWith(expect.objectContaining({ x: 100, y: 247, ownerId: "me" }));
  });

  it("requeues a settlement when the server rejects it only because development slots are full", () => {
    const state = createState();
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.gold = 10;
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "settle"
    });
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const pushFeed = vi.fn();
    const deps = bindWithDeps(state, ws, { showCaptureAlert, pushFeed });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "all 4 development slots are busy", x: 12, y: 18 })
    });

    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("12,18", true);
    expect(deps.clearSettlementProgressByKey).toHaveBeenCalledWith("12,18");
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" }]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Settlement at (12, 18) queued. It will start when a development slot frees up.", "combat", "info");
  });

  it("requeues a settlement without crashing when settlement clear wiring is missing", () => {
    const state = createState();
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "settle"
    });
    state.settleProgressByTile.set("12,18", {
      startAt: Date.now() - 1000,
      resolvesAt: Date.now() + 10_000,
      target: { x: 12, y: 18 },
      awaitingServerConfirm: false
    });
    const ws = new FakeWebSocket();
    const pushFeed = vi.fn();
    bindWithDeps(state, ws, { clearSettlementProgressByKey: undefined, pushFeed });

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "all 4 development slots are busy", x: 12, y: 18 })
      })
    ).not.toThrow();

    expect(state.settleProgressByTile.has("12,18")).toBe(false);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" }]);
    expect(pushFeed).toHaveBeenCalledWith("Settlement at (12, 18) queued. It will start when a development slot frees up.", "combat", "info");
  });

  it("handles non-busy settlement failures without crashing when settlement clear wiring is missing", () => {
    const state = createState();
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "settle"
    });
    state.settleProgressByTile.set("12,18", {
      startAt: Date.now() - 1000,
      resolvesAt: Date.now() + 10_000,
      target: { x: 12, y: 18 },
      awaitingServerConfirm: false
    });
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, { clearSettlementProgressByKey: undefined, showCaptureAlert });

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "tile is already settled", x: 12, y: 18 })
      })
    ).not.toThrow();

    expect(state.settleProgressByTile.has("12,18")).toBe(false);
    expect(showCaptureAlert).toHaveBeenCalledWith("Action failed", "tile is already settled", "warn", undefined);
  });

  it("requeues a settlement when the server rejects it during a combat lock window", () => {
    const state = createState();
    state.actionInFlight = true;
    state.actionTargetKey = "12,18";
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "settle"
    });
    state.settleProgressByTile.set("12,18", {
      startAt: Date.now() - 1000,
      resolvesAt: Date.now() + 10_000,
      target: { x: 12, y: 18 },
      awaitingServerConfirm: false
    });
    const ws = new FakeWebSocket();
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, { pushFeed, showCaptureAlert, clearSettlementProgressByKey: undefined });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "tile is locked in combat", x: 12, y: 18 })
    });

    expect(state.settleProgressByTile.has("12,18")).toBe(false);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" }]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Settlement at (12, 18) queued. It will start when a development slot frees up.", "combat", "info");
  });

  it("does not crash on settlement errors when alert and queue callbacks are missing", () => {
    const state = createState();
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER",
      optimisticPending: "settle"
    });
    state.settleProgressByTile.set("12,18", {
      startAt: Date.now() - 1000,
      resolvesAt: Date.now() + 10_000,
      target: { x: 12, y: 18 },
      awaitingServerConfirm: false
    });
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, {
      clearSettlementProgressByKey: undefined,
      showCaptureAlert: undefined,
      pushFeed: undefined,
      explainActionFailure: undefined,
      reconcileActionQueue: undefined,
      processActionQueue: undefined
    });

    expect(() =>
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "tile is already settled", x: 12, y: 18 })
      })
    ).not.toThrow();
  });

  it("requeues a structure build when the server rejects it only because development slots are full", () => {
    const state = createState();
    state.lastDevelopmentAttempt = {
      kind: "BUILD",
      x: 33,
      y: 44,
      tileKey: "33,44",
      label: "Fort at (33, 44)",
      payload: { type: "BUILD_FORT", x: 33, y: 44 },
      optimisticKind: "FORT"
    };
    state.tiles.set("33,44", {
      x: 33,
      y: 44,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "SETTLED",
      optimisticPending: "structure_build"
    });
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const pushFeed = vi.fn();
    const deps = bindWithDeps(state, ws, { showCaptureAlert, pushFeed });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "FORT_BUILD_INVALID", message: "all 4 development slots are busy", x: 33, y: 44 })
    });

    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("33,44", true);
    expect(state.developmentQueue).toEqual([
      {
        kind: "BUILD",
        x: 33,
        y: 44,
        tileKey: "33,44",
        label: "Fort at (33, 44)",
        payload: { type: "BUILD_FORT", x: 33, y: 44 },
        optimisticKind: "FORT"
      }
    ]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Fort at (33, 44) queued. It will start when a development slot frees up.", "combat", "info");
  });
});
