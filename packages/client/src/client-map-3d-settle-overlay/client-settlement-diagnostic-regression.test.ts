import { describe, expect, it, vi } from "vitest";

import { showCaptureAlert } from "../client-alerts/client-alerts.js";
import { bindClientNetwork } from "../client-network/client-network.js";
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

const bind = (state: any, ws: FakeWebSocket) => {
  const pushFeed = vi.fn();

  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3101/ws",
    keyFor: (x: number, y: number) => `${x},${y}`,
    renderHud: vi.fn(),
    setAuthStatus: vi.fn(),
    syncAuthOverlay: vi.fn(),
    authenticateSocket: vi.fn(async () => {}),
    pushFeed,
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
    clearPendingCollectVisibleDelta: vi.fn(),
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
    showCollectVisibleCooldownAlert: vi.fn(),
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue: vi.fn(),
    revertOptimisticVisibleCollectDelta: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    applyOptimisticTileState: vi.fn()
  } as any);

  return { pushFeed };
};

const emitPlayerUpdate = (ws: FakeWebSocket, diagnostic?: { key: string; detail: string }) => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "PLAYER_UPDATE",
      gold: 10,
      points: 10,
      level: 1,
      strategicResources: {},
      stamina: 0,
      manpower: 0,
      manpowerCap: 0,
      manpowerRegenPerMinute: 0,
      T: 1,
      E: 0,
      Ts: 1,
      Es: 0,
      shieldUntil: 0,
      defensiveness: 100,
      profileNeedsSetup: false,
      ...(diagnostic ? { settlementRepairDiagnostic: diagnostic } : {})
    })
  });
};

describe("settlement diagnostic regression", () => {
  it("shows the diagnostic on INIT, clears it when PLAYER_UPDATE omits it, and resurfaces it later", () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000);

    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed } = bind(state, ws);
    const diagnostic = {
      key: "missing-settlement:eligible:405,192",
      detail: "Your empire has no active settlement. Eligible settled tile: 405,192."
    };

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: {
          id: "player-1",
          name: "Player 1",
          points: 10,
          level: 1,
          stamina: 0,
          manpower: 0,
          techIds: [],
          domainIds: [],
          revealTargets: [],
          availableTechPicks: 0,
          allies: []
        },
        config: {},
        settlementRepairDiagnostic: diagnostic
      })
    });

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Settlement Missing",
        detail: diagnostic.detail,
        tone: "error"
      })
    );
    expect(state.settlementRepairDiagnosticKey).toBe(diagnostic.key);
    expect(pushFeed).toHaveBeenCalledWith(diagnostic.detail, "error", "error");

    emitPlayerUpdate(ws);

    expect(state.settlementRepairDiagnosticKey).toBe("");

    emitPlayerUpdate(ws, diagnostic);

    expect(pushFeed.mock.calls.filter((call) => call[0] === diagnostic.detail && call[1] === "error" && call[2] === "error")).toHaveLength(2);
    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Settlement Missing",
        detail: diagnostic.detail,
        tone: "error"
      })
    );
  });

  it("does not spam duplicate alerts while the same diagnostic is still active", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const { pushFeed } = bind(state, ws);
    const diagnostic = {
      key: "missing-settlement:blocked:405,192(has a resource)",
      detail: "Your empire has no active settlement, and no settled tile can host one. Blocked settled tiles: 405,192 (has a resource)."
    };

    emitPlayerUpdate(ws, diagnostic);
    emitPlayerUpdate(ws, diagnostic);

    expect(pushFeed.mock.calls.filter((call) => call[0] === diagnostic.detail && call[1] === "error" && call[2] === "error")).toHaveLength(1);
    expect(state.settlementRepairDiagnosticKey).toBe(diagnostic.key);
  });
});
