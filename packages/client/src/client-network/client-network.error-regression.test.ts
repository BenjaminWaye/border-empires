import { describe, expect, it, vi } from "vitest";
import { bindClientNetwork } from "./client-network.js";
import { explainActionFailureFromServer } from "../client-player-actions.js";

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
    actionAcceptedAck: false,
    combatStartAck: true,
    actionStartedAt: 123,
    actionCurrent: { x: 60, y: 302 },
    frontierSyncWaitUntilByTarget: new Map<string, number>(),
    frontierLateAckUntilByTarget: new Map<string, number>(),
    autoSettleTargets: new Set<string>(["60,302"]),
    attackPreviewPendingKey: "60,302->61,302",
    attackPreview: { valid: true },
    attackPreviewCacheByKey: new Map<string, unknown>(),
    attackPreviewLatestRequestIdByKey: new Map<string, string>(),
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
    applyOptimisticTileState,
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

  it("drops ERROR messages with empty code and message instead of flooding [server-error]", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      for (let i = 0; i < 5; i += 1) {
        ws.emit("message", {
          data: JSON.stringify({ type: "ERROR", code: "", message: "" })
        });
      }
      const serverErrorCalls = errorSpy.mock.calls.filter(([label]) => label === "[server-error]");
      expect(serverErrorCalls).toHaveLength(0);
      const dropWarnings = warnSpy.mock.calls.filter(([label]) =>
        typeof label === "string" && label.includes("[server-error]") && label.includes("dropping empty ERROR")
      );
      expect(dropWarnings).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });

  it("still logs [server-error] for real rejections with a populated code", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "ATTACK_COOLDOWN", message: "origin tile is still on attack cooldown" })
      });
      const serverErrorCalls = errorSpy.mock.calls.filter(([label]) => label === "[server-error]");
      expect(serverErrorCalls).toHaveLength(1);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("routes INSUFFICIENT_GOLD build rejections to the capture alert (not the frontier notifier) and rolls back the optimistic build", () => {
    const state = createState();
    state.gold = 1500;
    state.lastDevelopmentAttempt = {
      kind: "BUILD",
      x: 14,
      y: 299,
      tileKey: "14,299",
      label: "Build Market",
      payload: { type: "BUILD_STRUCTURE", x: 14, y: 299, structureType: "MARKET" },
      optimisticKind: "MARKET"
    };
    state.queuedDevelopmentDispatchPending = true;
    const showCaptureAlert = vi.fn();
    const notifyInsufficientGoldForFrontierAction = vi.fn();
    const ws = new FakeWebSocket();
    const { clearOptimisticTileState } = bindWithDeps(state, ws, {
      showCaptureAlert,
      notifyInsufficientGoldForFrontierAction
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for market" })
      });
      expect(notifyInsufficientGoldForFrontierAction).not.toHaveBeenCalled();
      expect(showCaptureAlert).toHaveBeenCalledTimes(1);
      const captureArgs = showCaptureAlert.mock.calls[0] ?? [];
      expect(captureArgs[0]).toBe("Insufficient gold");
      expect(captureArgs[1]).toContain("Insufficient gold for market");
      expect(captureArgs[1]).toContain("1500.00");
      expect(captureArgs[2]).toBe("warn");
      expect(clearOptimisticTileState).toHaveBeenCalledWith("14,299", true);
      expect(state.lastDevelopmentAttempt).toBeUndefined();
      expect(state.queuedDevelopmentDispatchPending).toBe(false);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("still uses the frontier notifier for INSUFFICIENT_GOLD on frontier claim and attack", () => {
    const state = createState();
    state.gold = 25;
    const showCaptureAlert = vi.fn();
    const notifyInsufficientGoldForFrontierAction = vi.fn();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws, {
      showCaptureAlert,
      notifyInsufficientGoldForFrontierAction
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for frontier claim" })
      });
      ws.emit("message", {
        data: JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_GOLD", message: "insufficient gold for attack" })
      });
      expect(notifyInsufficientGoldForFrontierAction).toHaveBeenCalledTimes(2);
      expect(notifyInsufficientGoldForFrontierAction.mock.calls[0]?.[0]).toBe("claim");
      expect(notifyInsufficientGoldForFrontierAction.mock.calls[1]?.[0]).toBe("attack");
      const captureAlertCalls = showCaptureAlert.mock.calls.filter(([title]) => title === "Insufficient gold");
      expect(captureAlertCalls).toHaveLength(0);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it("preserves shard sites when a frontier tile delta explicitly clears shard detail during claim confirmation", () => {
    const state = createState();
    state.tiles.set("60,302", {
      x: 60,
      y: 302,
      terrain: "LAND",
      fogged: false,
      shardSite: { kind: "CACHE", amount: 1 }
    });
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 60, y: 302, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "FRONTIER", detailLevel: "summary", shardSiteJson: "" }]
      })
    });

    expect(state.tiles.get("60,302")?.ownerId).toBe("me");
    expect(state.tiles.get("60,302")?.ownershipState).toBe("FRONTIER");
    expect(state.tiles.get("60,302")?.shardSite).toEqual({ kind: "CACHE", amount: 1 });
  });

  it("does not resurrect a collected shard on later owned-frontier tile deltas", () => {
    const state = createState();
    state.tiles.set("60,302", {
      x: 60,
      y: 302,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "FRONTIER"
    });
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 60, y: 302, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "FRONTIER", detailLevel: "summary", shardSiteJson: "" }]
      })
    });

    expect(state.tiles.get("60,302")?.shardSite).toBeUndefined();
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
    const showCaptureAlert = vi.fn();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true),
      explainActionFailure: vi.fn(explainActionFailureFromServer),
      formatCooldownShort: vi.fn((ms: number) => `${Math.ceil(ms / 1000)}s`),
      showCaptureAlert
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
    expect(showCaptureAlert).toHaveBeenCalledWith("Action blocked", "Action blocked: that origin tile is still on attack cooldown for 3s.", "warn", undefined);
    expect(deps.pushFeed).not.toHaveBeenCalled();
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("60,302", true);
    expect(deps.reconcileActionQueue).toHaveBeenCalled();
  });

  it("keeps TOWN_UNFED out of the activity feed because the map badge is persistent", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const deps = bindWithDeps(state, ws, {
      showCaptureAlert,
      explainActionFailure: vi.fn(explainActionFailureFromServer)
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "TOWN_UNFED", message: "Town is unfed" })
    });

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Town unfed",
      "Town is unfed. Check the warning badge on the affected town.",
      "warn",
      undefined
    );
    expect(deps.pushFeed).not.toHaveBeenCalled();
  });

  it("delays queued frontier retries until attack cooldown expires", () => {
    vi.useFakeTimers();
    try {
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

      expect(deps.processActionQueue).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2_450);
      expect(deps.processActionQueue).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ignores duplicate attack cooldown errors once the current frontier action is already accepted", () => {
    const state = createState();
    state.actionAcceptedAck = true;
    state.combatStartAck = true;
    state.capture = { startAt: Date.now() - 1_200, resolvesAt: Date.now() + 1_800, target: { x: 60, y: 302 } };
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true)
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "ATTACK_COOLDOWN", message: "origin tile is still on attack cooldown", cooldownRemainingMs: 1_600 })
    });

    expect(state.actionInFlight).toBe(true);
    expect(state.actionAcceptedAck).toBe(true);
    expect(state.combatStartAck).toBe(true);
    expect(state.actionTargetKey).toBe("60,302");
    expect(state.actionCurrent).toEqual(expect.objectContaining({ x: 60, y: 302 }));
    expect(state.capture).toEqual(expect.objectContaining({ target: { x: 60, y: 302 } }));
    expect(state.frontierSyncWaitUntilByTarget.get("60,302")).toBeGreaterThan(Date.now());
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(1, true);
    expect(deps.clearOptimisticTileState).not.toHaveBeenCalled();
    expect(deps.reconcileActionQueue).not.toHaveBeenCalled();
  });

  it("explains invalid attack targets separately from adjacency failures", () => {
    expect(explainActionFailureFromServer("ATTACK_TARGET_INVALID", "target must be enemy-controlled land")).toBe(
      "Action blocked: target must be enemy-controlled land."
    );
    expect(explainActionFailureFromServer("NOT_ADJACENT", "target must be adjacent or valid dock crossing")).toBe(
      "Action blocked: target must border your territory or a linked dock."
    );
  });

  it("keeps outgoing truce requests from TRUCE_UPDATE payloads", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TRUCE_UPDATE",
        activeTruces: [],
        incomingTruceRequests: [],
        outgoingTruceRequests: [
          {
            id: "truce-1",
            fromPlayerId: "me",
            toPlayerId: "ai-1",
            createdAt: 1,
            expiresAt: 2,
            durationHours: 12,
            toName: "ai-1"
          }
        ]
      })
    });

    expect(state.outgoingTruceRequests).toEqual([expect.objectContaining({ id: "truce-1", toPlayerId: "ai-1" })]);
    expect(deps.pushFeed).not.toHaveBeenCalled();
  });

  it("shows truce result announcements as popups", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const deps = bindWithDeps(state, ws, { showCaptureAlert });

    ws.emit("message", {
      data: JSON.stringify({
        type: "TRUCE_UPDATE",
        activeTruces: [],
        incomingTruceRequests: [],
        outgoingTruceRequests: [],
        announcement: "AI 2 declined your truce offer."
      })
    });

    expect(deps.pushFeed).toHaveBeenCalledWith("AI 2 declined your truce offer.", "alliance", "warn");
    expect(showCaptureAlert).toHaveBeenCalledWith("Truce declined", "AI 2 declined your truce offer.", "warn", undefined);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TRUCE_UPDATE",
        activeTruces: [],
        incomingTruceRequests: [],
        outgoingTruceRequests: [],
        announcement: "AI 1 and player-1 agreed to a 12h truce."
      })
    });

    expect(deps.pushFeed).toHaveBeenCalledWith("AI 1 and player-1 agreed to a 12h truce.", "alliance", "success");
    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Truce accepted",
      "AI 1 and player-1 agreed to a 12h truce.",
      "success",
      undefined
    );

    ws.emit("message", {
      data: JSON.stringify({
        type: "TRUCE_UPDATE",
        activeTruces: [],
        incomingTruceRequests: [],
        outgoingTruceRequests: [],
        announcement: "AI 1 broke the truce with player-1."
      })
    });

    expect(deps.pushFeed).toHaveBeenCalledWith("AI 1 broke the truce with player-1.", "alliance", "warn");
    expect(showCaptureAlert).toHaveBeenCalledWith("Truce broken", "AI 1 broke the truce with player-1.", "warn", undefined);
  });

  it("shows diplomacy errors as warning popups with readable copy", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, {
      explainActionFailure: vi.fn(explainActionFailureFromServer),
      showCaptureAlert
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "TRUCE_TARGET", message: "target not found" })
    });

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Diplomacy failed",
      "Cannot offer truce: target not found.",
      "warn",
      undefined
    );
  });

  it("shows a warning popup for dock cooldown on an in-flight frontier action", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true),
      explainActionFailure: vi.fn(explainActionFailureFromServer),
      formatCooldownShort: vi.fn((ms: number) => `${Math.ceil(ms / 1000)}s`),
      showCaptureAlert
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "DOCK_COOLDOWN", message: "dock crossing endpoint on cooldown", cooldownRemainingMs: 2_400 })
    });

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Action blocked",
      "Action blocked: that dock crossing endpoint is still on cooldown for 3s.",
      "warn",
      undefined
    );
    expect(state.frontierSyncWaitUntilByTarget.get("60,302")).toBeGreaterThan(Date.now());
    expect(state.frontierSyncWaitUntilByTarget.get("60,302")).toBeLessThanOrEqual(Date.now() + 3_500);
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
  });

  it("shows a warning popup for insufficient manpower on an in-flight attack", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true),
      explainActionFailure: vi.fn(explainActionFailureFromServer),
      showCaptureAlert
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "INSUFFICIENT_MANPOWER", message: "need 60 manpower to launch attack" })
    });

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Action blocked",
      "Action blocked: need 60 manpower to launch attack.",
      "warn",
      undefined
    );
    expect(state.actionInFlight).toBe(false);
    expect(state.actionTargetKey).toBe("");
    expect(state.actionCurrent).toBeUndefined();
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
  });

  it("shows a warning popup for not-owner rejects on an in-flight attack", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const deps = bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true),
      explainActionFailure: vi.fn(explainActionFailureFromServer),
      showCaptureAlert
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "NOT_OWNER", message: "origin not owned" })
    });

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Action blocked",
      "Action blocked: you need to launch from one of your own tiles.",
      "warn",
      undefined
    );
    expect(state.actionInFlight).toBe(false);
    expect(state.actionTargetKey).toBe("");
    expect(state.actionCurrent).toBeUndefined();
    expect(deps.requestViewRefresh).toHaveBeenCalledWith(2, true);
  });

  it("shows a frontier resync popup when the server says an expand target is already owned", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    bindWithDeps(state, ws, {
      shouldResetFrontierActionStateForError: vi.fn(() => true),
      showCaptureAlert
    });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "EXPAND_TARGET_OWNED", message: "expand only targets neutral land" })
    });

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Frontier sync mismatch",
      "Server says that tile is already owned. Download the debug log from this popup and refresh nearby tiles to resync.",
      "warn",
      undefined
    );
  });

  it("marks an in-flight attack as accepted before combat start arrives", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ACTION_ACCEPTED",
        actionType: "ATTACK",
        origin: { x: 59, y: 302 },
        target: { x: 60, y: 302 },
        resolvesAt: Date.now() + 3_000
      })
    });

    expect(state.actionAcceptedAck).toBe(true);
    expect(state.actionInFlight).toBe(true);
    expect(state.actionTargetKey).toBe("60,302");
  });

  it("applies pending frontier ownership only after an expand is accepted", () => {
    const state = createState();
    state.tiles.set("60,302", {
      x: 60,
      y: 302,
      terrain: "LAND",
      fogged: false
    });
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ACTION_ACCEPTED",
        actionType: "EXPAND",
        origin: { x: 59, y: 302 },
        target: { x: 60, y: 302 },
        resolvesAt: Date.now() + 3_000
      })
    });

    expect(deps.applyOptimisticTileState).toHaveBeenCalledWith(60, 302, expect.any(Function));
    expect(state.tiles.get("60,302")).toEqual(
      expect.objectContaining({
        ownerId: "me",
        ownershipState: "FRONTIER",
        optimisticPending: "expand"
      })
    );
  });

  it("rebinds a timed-out frontier target when combat start arrives late", () => {
    const state = createState();
    state.actionInFlight = false;
    state.actionAcceptedAck = false;
    state.combatStartAck = false;
    state.actionStartedAt = 0;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.capture = undefined;
    state.frontierLateAckUntilByTarget.set("60,302", Date.now() + 10_000);
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_START",
        target: { x: 60, y: 302 },
        origin: { x: 59, y: 302 },
        resolvesAt: Date.now() + 3_000
      })
    });

    expect(state.actionInFlight).toBe(true);
    expect(state.actionAcceptedAck).toBe(true);
    expect(state.combatStartAck).toBe(true);
    expect(state.actionTargetKey).toBe("60,302");
    expect(state.actionCurrent).toEqual(expect.objectContaining({ x: 60, y: 302, retries: 0 }));
    expect(state.frontierLateAckUntilByTarget.has("60,302")).toBe(false);
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
        generation: 1,
        tilesMaskedByFog: [{ x: 5, y: 6, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "SETTLED", detailLevel: "summary" }]
      })
    });

    expect(deps.requestTileDetailIfNeeded).toHaveBeenCalledWith(
      expect.objectContaining({ x: 5, y: 6, ownerId: "me", detailLevel: "summary" })
    );
  });

  it("rebuilds terrain caches when runtime land context changes", () => {
    const state = createState();
    state.tiles.set("100,247", {
      x: 100,
      y: 247,
      terrain: "LAND",
      fogged: false,
      detailLevel: "summary",
      landBiome: "GRASS",
      regionType: "BROKEN_HIGHLANDS"
    });
    const ws = new FakeWebSocket();
    const clearRenderCaches = vi.fn();
    const buildMiniMapBase = vi.fn();
    bindWithDeps(state, ws, { clearRenderCaches, buildMiniMapBase });

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 100, y: 247, terrain: "LAND", fogged: false, detailLevel: "summary", landBiome: "SAND", regionType: "CRYSTAL_WASTES" }]
      })
    });

    expect(clearRenderCaches).toHaveBeenCalledTimes(1);
    expect(buildMiniMapBase).toHaveBeenCalledTimes(1);
  });

  it("clears stale runtime land context when a tile stops being visible land", () => {
    const state = createState();
    state.tiles.set("100,247", {
      x: 100,
      y: 247,
      terrain: "LAND",
      fogged: false,
      detailLevel: "summary",
      landBiome: "SAND",
      regionType: "ANCIENT_HEARTLAND"
    });
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 100, y: 247, terrain: "MOUNTAIN", fogged: false, detailLevel: "summary" }]
      })
    });

    expect(state.tiles.get("100,247")).toEqual(
      expect.objectContaining({
        x: 100,
        y: 247,
        terrain: "MOUNTAIN"
      })
    );
    expect(state.tiles.get("100,247")?.landBiome).toBeUndefined();
    expect(state.tiles.get("100,247")?.regionType).toBeUndefined();
  });

  it("preserves ownership when a sparse TILE_DELTA omits owner fields (unchanged means preserve)", () => {
    // Previously named "clears stale barbarian ownership when an
    // authoritative TILE_DELTA omits owner fields" -- that behavior was a
    // workaround for stale barbarian tiles, but treating "no ownerId in the
    // message" as "clear it" is backwards: the server now always includes
    // ownerId/ownershipState/capital when they actually change (#774/#777/
    // #779), so omission means unchanged, not cleared. The old behavior
    // wiped correct ownership on any update that happened to omit these
    // fields (e.g. a REQUEST_TILE_DETAIL response built from an incomplete
    // server-side cache entry -- confirmed live on a dock tile).
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
    expect(state.tiles.get("100,247")?.ownerId).toBe("barbarian");
    expect(state.tiles.get("100,247")?.ownershipState).toBe("BARBARIAN");
    expect(state.tiles.get("100,247")?.capital).toBe(true);
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
        generation: 1,
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

  it("does not advance the queued attack chain when an attack target flips to frontier before combat result arrives", () => {
    const state = createState();
    state.actionInFlight = true;
    state.actionTargetKey = "100,247";
    state.actionAcceptedAck = true;
    state.combatStartAck = true;
    state.actionStartedAt = Date.now() - 500;
    state.actionCurrent = { x: 100, y: 247, retries: 0, actionType: "ATTACK" };
    state.capture = { startAt: Date.now() - 500, resolvesAt: Date.now() + 2_500, target: { x: 100, y: 247 } };
    state.actionQueue = [{ x: 101, y: 247, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["100,247", "101,247"]);
    state.tiles.set("100,247", {
      x: 100,
      y: 247,
      terrain: "LAND",
      fogged: false,
      ownerId: "enemy",
      ownershipState: "SETTLED",
      detailLevel: "full"
    });
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 100, y: 247, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "FRONTIER", detailLevel: "full" }]
      })
    });

    expect(state.actionInFlight).toBe(true);
    expect(state.actionTargetKey).toBe("100,247");
    expect(state.actionCurrent).toEqual(expect.objectContaining({ x: 100, y: 247, actionType: "ATTACK" }));
    expect(state.capture).toEqual(expect.objectContaining({ target: { x: 100, y: 247 } }));
    expect(state.actionQueue).toEqual([{ x: 101, y: 247, retries: 0 }]);
    expect(deps.processActionQueue).not.toHaveBeenCalled();
  });

  it("keeps waiting for frontier sync when a chunk refresh still shows the target as neutral", () => {
    const state = createState();
    state.actionInFlight = false;
    state.capture = undefined;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.actionQueue = [{ x: 100, y: 247, retries: 0 }];
    state.queuedTargetKeys = new Set<string>(["100,247"]);
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
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "CHUNK_FULL",
        generation: 1,
        tilesMaskedByFog: [{ x: 100, y: 247, terrain: "LAND", fogged: false, detailLevel: "summary" }]
      })
    });

    expect(state.frontierSyncWaitUntilByTarget.get("100,247")).toBeGreaterThan(Date.now());
    expect(state.actionQueue).toEqual([{ x: 100, y: 247, retries: 0 }]);
    expect(state.queuedTargetKeys.has("100,247")).toBe(true);
  });

  it("ignores stale chunk snapshots that arrive after a newer generation", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "CHUNK_BATCH",
        generation: 2,
        chunks: [
          {
            cx: 0,
            cy: 0,
            tilesMaskedByFog: [{ x: 40, y: 238, terrain: "LAND", fogged: false, ownerId: "enemy", ownershipState: "SETTLED" }]
          }
        ]
      })
    });

    ws.emit("message", {
      data: JSON.stringify({
        type: "CHUNK_BATCH",
        generation: 1,
        chunks: [
          {
            cx: 0,
            cy: 0,
            tilesMaskedByFog: [{ x: 40, y: 238, terrain: "LAND", fogged: false, ownerId: "me", ownershipState: "FRONTIER" }]
          }
        ]
      })
    });

    expect(state.lastChunkSnapshotGeneration).toBe(2);
    expect(state.tiles.get("40,238")).toEqual(
      expect.objectContaining({
        x: 40,
        y: 238,
        ownerId: "enemy",
        ownershipState: "SETTLED"
      })
    );
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
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "all 4 development slots are busy", x: 12, y: 18 })
    });

    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("12,18", true);
    expect(deps.clearSettlementProgressByKey).toHaveBeenCalledWith("12,18");
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" }]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Settlement at (12, 18) queued. It will start when a development slot frees up.", "combat", "info");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("requeues a busy settlement from the server tile when latest settle state still matches", () => {
    const state = createState();
    state.lastDevelopmentAttempt = undefined;
    state.latestSettleTargetKey = "12,18";
    state.activeDevelopmentProcessCount = 0;
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    });
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const pushFeed = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bindWithDeps(state, ws, { showCaptureAlert, pushFeed });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "all 3 development slots are busy", x: 12, y: 18 })
    });

    expect(state.activeDevelopmentProcessCount).toBe(3);
    expect(state.developmentQueue).toEqual([{ kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" }]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Settlement at (12, 18) queued. It will start when a development slot frees up.", "combat", "info");
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });

  it("does not invent a queued settlement from a busy error with no local settle evidence", () => {
    const state = createState();
    state.lastDevelopmentAttempt = undefined;
    state.latestSettleTargetKey = "";
    state.settleProgressByTile.clear();
    state.queuedDevelopmentDispatchPending = false;
    state.activeDevelopmentProcessCount = 0;
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      ownerId: "me",
      ownershipState: "FRONTIER"
    });
    const ws = new FakeWebSocket();
    const showCaptureAlert = vi.fn();
    const pushFeed = vi.fn();
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    bindWithDeps(state, ws, { showCaptureAlert, pushFeed });

    ws.emit("message", {
      data: JSON.stringify({ type: "ERROR", code: "SETTLE_INVALID", message: "all 3 development slots are busy", x: 12, y: 18 })
    });

    expect(state.activeDevelopmentProcessCount).toBe(3);
    expect(state.developmentQueue).toEqual([]);
    expect(showCaptureAlert).toHaveBeenCalledWith("Action failed", "all 3 development slots are busy", "warn", undefined);
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
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
      payload: { type: "BUILD_STRUCTURE", x: 33, y: 44, structureType: "FORT" },
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
        payload: { type: "BUILD_STRUCTURE", x: 33, y: 44, structureType: "FORT" },
        optimisticKind: "FORT"
      }
    ]);
    expect(showCaptureAlert).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Fort at (33, 44) queued. It will start when a development slot frees up.", "combat", "info");
  });

  it("keeps the socket-connected bootstrap state and schedules auth retry when the server reports SERVER_STARTING", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const authenticateSocket = vi.fn(async () => {});
    const renderHud = vi.fn(), syncAuthOverlay = vi.fn(), setAuthStatus = vi.fn();
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });

    bindWithDeps(state, ws, {
      firebaseAuth: { currentUser: { uid: "player-1" } },
      renderHud,
      setAuthStatus,
      syncAuthOverlay,
      authenticateSocket
    });

    ws.emit("message", {
      data: JSON.stringify({
        type: "ERROR",
        code: "SERVER_STARTING",
        message: "Realtime simulation is temporarily unavailable. Retry shortly."
      })
    });

    expect([state.authSessionReady, state.connection, state.firstChunkAt, state.chunkFullCount, state.authBusy, state.authRetrying, state.authRetryAttempt]).toEqual([false, "connected", 0, 0, true, true, 1]);
    expect(state.authRetryNextAt).toBeGreaterThan(0);
    expect(setAuthStatus).toHaveBeenCalledWith("Game server is still starting. Retrying sign-in...");
    expect(syncAuthOverlay).toHaveBeenCalled();
    expect(renderHud).toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(authenticateSocket).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  // Regression for the 2026-07-14 staging login stall: SERVER_STARTING alone
  // ("still starting") is misleading once the sim is up but draining a large
  // command backlog after a restart — the gateway now flags this case with
  // backlogDegraded: true so the client can show an accurate message instead.
  it("shows the backlog-replay message instead of the generic 'still starting' text when the server flags backlogDegraded", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const setAuthStatus = vi.fn();
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout });

    bindWithDeps(state, ws, {
      firebaseAuth: { currentUser: { uid: "player-1" } },
      setAuthStatus
    });

    ws.emit("message", {
      data: JSON.stringify({
        type: "ERROR",
        code: "SERVER_STARTING",
        message: "The game server is replaying a backlog of prior activity after a restart. This can take a few minutes; no progress is lost. Retrying automatically...",
        backlogDegraded: true
      })
    });

    expect(state.authBusyDetail).toContain("replaying a backlog");
    expect(setAuthStatus).toHaveBeenCalledWith("Server is replaying a backlog after a restart. Retrying sign-in...");

    vi.runOnlyPendingTimers();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("rolls back optimistic settlement progress and shows an outage alert on SIMULATION_UNAVAILABLE", () => {
    const state = createState();
    state.actionInFlight = false;
    state.actionTargetKey = "";
    state.actionCurrent = undefined;
    state.capture = undefined;
    state.lastDevelopmentAttempt = { kind: "SETTLE", x: 12, y: 18, tileKey: "12,18", label: "Settlement at (12, 18)" };
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
    const deps = bindWithDeps(state, ws, { showCaptureAlert, clearSettlementProgressByKey: undefined });

    ws.emit("message", {
      data: JSON.stringify({
        type: "ERROR",
        code: "SIMULATION_UNAVAILABLE",
        message: "command could not be queued in simulation"
      })
    });

    expect(deps.clearOptimisticTileState).toHaveBeenCalledWith("12,18", true);
    expect(state.settleProgressByTile.has("12,18")).toBe(false);
    expect(state.lastDevelopmentAttempt).toBeUndefined();
    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Simulation unavailable",
      expect.stringContaining("Local action progress was rolled back"),
      "error",
      undefined
    );
  });

  it("emits ATTACK_ALERT via pushFeedEntry with focus coordinates", () => {
    const state = createState();
    state.unreadAttackAlerts = 0;
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    ws.emit("message", {
      data: JSON.stringify({
        type: "ATTACK_ALERT",
        attackerName: "AttackerPlayer",
        attackerId: "player-2",
        x: 42,
        y: 77,
        resolvesAt: Date.now() + 5000,
        fromX: 40,
        fromY: 75
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "Under attack: AttackerPlayer is striking (42, 77) from (40, 75).",
      type: "combat",
      severity: "error",
      at: expect.any(Number),
      focusX: 42,
      focusY: 77,
      actionLabel: "Center"
    });
    expect(state.incomingAttacksByTile.get("42,77")).toBeDefined();
    expect(state.unreadAttackAlerts).toBe(1);
  });

  it("clears the pending display-name change and surfaces the season-limit message on DISPLAY_NAME_LIMIT", () => {
    const state = createState();
    state.pendingDisplayNameChange = "New Name";
    const ws = new FakeWebSocket();
    const deps = bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ERROR",
        code: "DISPLAY_NAME_LIMIT",
        message: "You can only change your display name once per season. Try again next season."
      })
    });

    expect(state.pendingDisplayNameChange).toBe("");
    expect(deps.pushFeed).toHaveBeenCalledWith(
      "You can only change your display name once per season. Try again next season.",
      "error",
      "warn"
    );
  });

  it("pops a confirmation alert when a pending display-name change is confirmed via PLAYER_UPDATE", () => {
    const state = createState();
    state.pendingDisplayNameChange = "New Name";
    const ws = new FakeWebSocket();
    const originalWindow = (globalThis as any).window;
    const alertSpy = vi.fn();
    (globalThis as any).window = { ...(originalWindow ?? {}), alert: alertSpy };
    try {
      bindWithDeps(state, ws);
      ws.emit("message", { data: JSON.stringify({ type: "PLAYER_UPDATE", name: "New Name" }) });
    } finally {
      (globalThis as any).window = originalWindow;
    }

    expect(state.pendingDisplayNameChange).toBe("");
    expect(alertSpy).toHaveBeenCalledWith('Your display name is now "New Name".');
  });
});
