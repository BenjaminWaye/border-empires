import { afterEach, describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "./client-network.js";
import { createInitialState } from "../client-state/client-state.js";

// Regression coverage for the fix that replaced scheduleReconnectReload()'s
// unconditional window.location.reload() (which redid the entire boot
// sequence -- Firebase re-init, a fresh AUTH, a full server-side world
// rebuild -- on every reconnect, as slow as a first login) with an in-place
// ws.reconnect() retried with backoff, falling back to a hard reload only
// after repeated failures.
class FakeWebSocket {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;

  readonly CONNECTING = FakeWebSocket.CONNECTING;
  readonly OPEN = FakeWebSocket.OPEN;
  readonly CLOSING = FakeWebSocket.CLOSING;
  readonly CLOSED = FakeWebSocket.CLOSED;
  readyState: number = FakeWebSocket.OPEN;
  readonly reconnect = vi.fn(() => {
    this.readyState = FakeWebSocket.CONNECTING;
  });
  readonly close = vi.fn();
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
    ...createInitialState(),
    playerVisualStyles: new Map<string, unknown>(),
    hasEverInitialized: true
  }) as any;

const bind = (state: any, ws: FakeWebSocket) => {
  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3101/ws",
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
    mergeIncomingTileDetail: vi.fn((_existing, incoming) => incoming),
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
    combatResolutionAlert: vi.fn(() => ({ title: "", detail: "", tone: "success" as const })),
    wasPredictedCombatAlreadyShown: vi.fn(() => false),
    showCaptureAlert: vi.fn(),
    requestSettlement: vi.fn(() => false),
    settlementProgressForTile: vi.fn(() => false),
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
    applyOptimisticTileState: vi.fn()
  } as any);
};

const stubWindow = (reload: () => void) => {
  vi.stubGlobal("window", {
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
    location: { reload }
  });
};

describe("client network in-place reconnect regression", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("reconnects the existing socket in place instead of reloading the page after a drop", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const reload = vi.fn();
    stubWindow(reload);

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("close", { code: 1006, reason: "" });
    expect(reload).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();

    expect(ws.reconnect).toHaveBeenCalledTimes(1);
    expect(reload).not.toHaveBeenCalled();
  });

  it("falls back to a full page reload only after repeated failed in-place reconnect attempts", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const reload = vi.fn();
    stubWindow(reload);

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    // Each backoff timer firing calls ws.reconnect(); simulate every attempt
    // failing immediately by emitting another close right after.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ws.emit("close", { code: 1006, reason: "" });
      vi.runOnlyPendingTimers();
    }

    expect(ws.reconnect).toHaveBeenCalledTimes(5);
    expect(reload).not.toHaveBeenCalled();

    // The 6th close, after 5 failed in-place attempts, exceeds the budget
    // (MAX_INPLACE_RECONNECT_ATTEMPTS in client-network.ts) and falls back.
    ws.emit("close", { code: 1006, reason: "" });
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("resets the reconnect attempt budget once the socket opens successfully", () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const reload = vi.fn();
    stubWindow(reload);

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("close", { code: 1006, reason: "" });
    vi.runOnlyPendingTimers();
    expect(ws.reconnect).toHaveBeenCalledTimes(1);

    ws.readyState = FakeWebSocket.OPEN;
    ws.emit("open", {});
    state.connection = "connected";

    // A fresh run of 5 failed attempts after a successful open should again
    // take 5 attempts to exhaust the budget, proving it was reset rather than
    // continuing to accumulate toward the earlier reload threshold.
    for (let attempt = 0; attempt < 5; attempt += 1) {
      ws.emit("close", { code: 1006, reason: "" });
      vi.runOnlyPendingTimers();
    }
    expect(ws.reconnect).toHaveBeenCalledTimes(6);
    expect(reload).not.toHaveBeenCalled();
  });

  it("restarts mapLoadStartedAt on every socket open, not just the first ever connection", () => {
    // Regression for a bug where a backgrounded-tab reconnect showed a wildly
    // stale "Elapsed Xs" on the map-loading overlay: mapLoadStartedAt was
    // only ever set once (guarded by "if unset"), so the elapsed timer kept
    // counting from the original page load instead of the current reconnect
    // attempt for however long the post-open INIT handshake took.
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const reload = vi.fn();
    stubWindow(reload);

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    const firstOpenAt = state.mapLoadStartedAt;

    vi.setSystemTime(950_000);
    ws.emit("close", { code: 1006, reason: "" });
    ws.readyState = FakeWebSocket.OPEN;
    ws.emit("open", {});

    expect(state.mapLoadStartedAt).toBeGreaterThan(firstOpenAt);
    expect(state.mapLoadStartedAt).toBe(950_000);
  });

  it("anchors disconnectedSince at the first drop and holds it through reopen and repeat drops in one outage", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const reload = vi.fn();
    stubWindow(reload);

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);
    expect(state.disconnectedSince).toBe(0);

    vi.setSystemTime(1_000);
    ws.emit("close", { code: 1006, reason: "" });
    expect(state.disconnectedSince).toBe(1_000);

    // Reopening the socket (pre-INIT "connected" state) must not clear it —
    // that gap is exactly what the overlay grace window is timing.
    vi.setSystemTime(1_050);
    ws.readyState = FakeWebSocket.OPEN;
    ws.emit("open", {});
    expect(state.disconnectedSince).toBe(1_000);

    // A second drop before recovery keeps the *original* drop time so the
    // overlay grace window doesn't keep resetting during a flapping outage
    // (which would let a long outage hide the overlay indefinitely).
    vi.setSystemTime(1_200);
    ws.emit("close", { code: 1006, reason: "" });
    expect(state.disconnectedSince).toBe(1_000);
  });

  it("re-anchors disconnectedSince on the next drop once the session actually recovered", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const reload = vi.fn();
    stubWindow(reload);

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    vi.setSystemTime(1_000);
    ws.emit("close", { code: 1006, reason: "" });
    expect(state.disconnectedSince).toBe(1_000);

    // Full recovery: INIT landed and chunks arrived, so the map is usable
    // again. INIT deliberately does not clear the anchor (the grace window
    // must still cover the post-INIT resync), so the stale value only clears
    // when a *healthy* session is the thing that drops.
    ws.readyState = FakeWebSocket.OPEN;
    ws.emit("open", {});
    state.connection = "initialized";
    state.firstChunkAt = 1_500;

    vi.setSystemTime(900_000);
    ws.emit("close", { code: 1006, reason: "" });
    // Without the re-anchor this would still read 1_000, making now-anchor
    // enormous and firing the overlay instantly on a plain tab switch — the
    // exact flash this whole change exists to prevent.
    expect(state.disconnectedSince).toBe(900_000);
  });
});
