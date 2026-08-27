import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";
import { snapshotClientDebugEvents } from "../client-debug/client-debug.js";

// Diagnostic-only coverage: a real waypoint that the durable server-side
// command log shows was never cancelled has twice now come back empty on
// reconnect. INIT's restore is skipped entirely whenever state.waypoint is
// already non-empty (a prior INIT this session already restored it) --
// harmless by design, but if that local state and the server ever disagree
// on WHICH targets, that disagreement was previously silent. This proves
// the trace fires so a real occurrence is provable from a diagnostics
// bundle's recentDebugEvents.
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

const createState = () => ({ ...createInitialState(), playerVisualStyles: new Map<string, unknown>() }) as any;

const bind = (state: any, ws: FakeWebSocket): void => {
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
    defensibilityPctFromTE: vi.fn(() => 0),
    seedProfileSetupFields: vi.fn(),
    resetStrategicReplayState: vi.fn(),
    setWorldSeed: vi.fn(),
    clearRenderCaches: vi.fn(),
    buildMiniMapBase: vi.fn(),
    shardAlertKeyForPayload: vi.fn(),
    showShardAlert: vi.fn(),
    combatResolutionAlert: vi.fn(() => ({ title: "", detail: "", tone: "success" })),
    wasPredictedCombatAlreadyShown: vi.fn(() => false),
    showCaptureAlert: vi.fn(),
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
    applyOptimisticTileState: vi.fn(),
    sendGameMessage: vi.fn(() => true)
  } as any);
};

const sendInit = (ws: FakeWebSocket, overrides: Record<string, unknown> = {}): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 }, ...overrides },
      config: {},
      recovery: { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

describe("INIT waypoint restore skip diagnostic", () => {
  it("logs waypoint-restore-skipped-non-empty when state.waypoint is already populated and the server still has entries", () => {
    const state = createState();
    state.waypoint = [{ target: { x: 9, y: 9 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any }];
    const ws = new FakeWebSocket();
    bind(state, ws);
    const before = snapshotClientDebugEvents().length;

    sendInit(ws, { waypointQueue: [{ x: 5, y: 5, queuedAt: 1 }] });

    const newEvents = snapshotClientDebugEvents().slice(before);
    const match = newEvents.find((e) => e.event === "waypoint-restore-skipped-non-empty");
    expect(match?.payload).toMatchObject({ localCount: 1, serverCount: 1 });
    // Restore is genuinely skipped -- local state is untouched.
    expect(state.waypoint).toEqual([{ target: { x: 9, y: 9 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } }]);
  });

  it("does not log when state.waypoint is already populated and the server has nothing", () => {
    const state = createState();
    state.waypoint = [{ target: { x: 9, y: 9 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any }];
    const ws = new FakeWebSocket();
    bind(state, ws);
    const before = snapshotClientDebugEvents().length;

    sendInit(ws, {});

    const newEvents = snapshotClientDebugEvents().slice(before);
    expect(newEvents.some((e) => e.event === "waypoint-restore-skipped-non-empty")).toBe(false);
  });
});
