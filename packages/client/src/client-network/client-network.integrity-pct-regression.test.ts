import { describe, expect, it, vi } from "vitest";

import { showCaptureAlert } from "../client-alerts/client-alerts.js";
import { bindClientNetwork } from "./client-network.js";
import { createInitialState } from "../client-state/client-state.js";

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
    ...createInitialState(),
    playerVisualStyles: new Map<string, unknown>()
  }) as any;

const createRuntimeStyleShowCaptureAlert =
  (state: any) =>
  (title: string, detail: string, tone: "success" | "error" | "warn" = "error", manpowerLoss?: number): void => {
    showCaptureAlert(state, title, detail, tone, manpowerLoss);
  };

// Every dependency below is required by bindClientNetwork's type but unused
// by the PLAYER_UPDATE branch under test — mirrors the fixture already used
// in client-network.gateway-sync-regression.test.ts.
const bind = (state: any, ws: FakeWebSocket, defensibilityPctFromTE: ReturnType<typeof vi.fn>) => {
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
    mergeIncomingTileDetail: vi.fn((_existing: unknown, incoming: unknown) => incoming),
    mergeServerTileWithOptimisticState: vi.fn((tile: unknown) => tile),
    maybeAnnounceShardSite: vi.fn(),
    markDockDiscovered: vi.fn(),
    centerOnOwnedTile: vi.fn(),
    authProfileNameEl: { value: "" },
    authProfileColorEl: { value: "" },
    defensibilityPctFromTE,
    seedProfileSetupFields: vi.fn(),
    resetStrategicReplayState: vi.fn(),
    setWorldSeed: vi.fn(),
    clearRenderCaches: vi.fn(),
    buildMiniMapBase: vi.fn(),
    shardAlertKeyForPayload: vi.fn(),
    showShardAlert: vi.fn(),
    combatResolutionAlert: vi.fn(() => ({ title: "", detail: "", tone: "success" })),
    wasPredictedCombatAlreadyShown: vi.fn(() => false),
    showCaptureAlert: createRuntimeStyleShowCaptureAlert(state),
    requestSettlement: vi.fn(() => false),
    dropQueuedTargetKeyIfAbsent: vi.fn(),
    processActionQueue: vi.fn(() => false),
    clearSettlementProgressForTile: vi.fn(),
    settlementProgressForTile: vi.fn(() => false),
    terrainAt: vi.fn(() => "LAND"),
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

describe("PLAYER_UPDATE integrityPct handling", () => {
  it("uses the server-authoritative integrityPct directly, bypassing the legacy T/E recompute", () => {
    const state = createState();
    state.me = "player-1";
    const ws = new FakeWebSocket();
    const defensibilityPctFromTE = vi.fn(() => 999); // sentinel — should never be used
    bind(state, ws, defensibilityPctFromTE);

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_UPDATE",
        T: 10,
        E: 20,
        Ts: 10,
        Es: 20,
        integrityPct: 73
      })
    });

    expect(state.defensibilityPct).toBe(73);
    expect(defensibilityPctFromTE).not.toHaveBeenCalled();
  });

  it("falls back to the legacy T/E recompute when integrityPct is absent", () => {
    const state = createState();
    state.me = "player-1";
    const ws = new FakeWebSocket();
    const defensibilityPctFromTE = vi.fn(() => 42);
    bind(state, ws, defensibilityPctFromTE);

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_UPDATE",
        T: 10,
        E: 20,
        Ts: 10,
        Es: 20
      })
    });

    expect(state.defensibilityPct).toBe(42);
    expect(defensibilityPctFromTE).toHaveBeenCalled();
  });

  it("clamps an out-of-range integrityPct into [0,100]", () => {
    const state = createState();
    state.me = "player-1";
    const ws = new FakeWebSocket();
    const defensibilityPctFromTE = vi.fn(() => 0);
    bind(state, ws, defensibilityPctFromTE);

    ws.emit("message", {
      data: JSON.stringify({ type: "PLAYER_UPDATE", integrityPct: 142 })
    });
    expect(state.defensibilityPct).toBe(100);

    ws.emit("message", {
      data: JSON.stringify({ type: "PLAYER_UPDATE", integrityPct: -30 })
    });
    expect(state.defensibilityPct).toBe(0);
  });
});
