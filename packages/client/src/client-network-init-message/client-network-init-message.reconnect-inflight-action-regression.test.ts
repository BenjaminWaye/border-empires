import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";

// Regression: a real page reload while an EXPAND was still resolving on the
// server used to lose the chain silently. The fresh page has no local
// actionCurrent, so when the server's FRONTIER_RESULT for that command
// finally arrived, matchesCurrentFrontierCommand's strict "own command"
// check (requireActionInFlight: true) rejected it as not belonging to this
// client -- even though FRONTIER_RESULT/ACTION_ACCEPTED are only ever
// delivered privately to the acting player (see gateway-app.ts's
// queueOrSendSessionPayload call sites), so any one received genuinely is
// this player's own. The tile still got claimed (a TILE_DELTA lands
// separately), but the claim animation/toast never fired and the client's
// UI never cleared its "in progress" state for that command -- looking to
// the player like the action, and the waypoint chain behind it, vanished.
//
// Root cause confirmed by reading the gateway send code (see PR body); this
// verifies the fix (INIT now surfaces the player's own unresolved commands
// via recovery.pendingCommands, and the client re-seeds actionCurrent from
// them) actually closes the gap end-to-end.
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

const sendInit = (ws: FakeWebSocket, overrides: Record<string, unknown> = {}, recovery?: Record<string, unknown>): void => {
  ws.emit("message", {
    data: JSON.stringify({
      type: "INIT",
      player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 40, y: 40 }, ...overrides },
      config: {},
      recovery: recovery ?? { nextClientSeq: 1, pendingCommands: [] }
    })
  });
};

describe("INIT re-seeds actionCurrent from a server-reported in-flight action", () => {
  it("adopts a late FRONTIER_RESULT for an ACCEPTED pending command instead of dropping it", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    // A fresh page load (state.actionCurrent starts undefined) reconnects
    // while an EXPAND it dispatched before the reload is still resolving.
    sendInit(ws, {}, {
      nextClientSeq: 5,
      pendingCommands: [
        {
          commandId: "cmd-inflight-1",
          clientSeq: 4,
          type: "EXPAND",
          status: "ACCEPTED",
          queuedAt: 1_000,
          acceptedAt: 1_050,
          payload: { fromX: 5, fromY: 5, toX: 6, toY: 5 }
        }
      ]
    });

    expect(state.actionCurrent).toEqual(
      expect.objectContaining({ x: 6, y: 5, commandId: "cmd-inflight-1", actionType: "EXPAND" })
    );

    ws.emit("message", {
      data: JSON.stringify({
        type: "FRONTIER_RESULT",
        commandId: "cmd-inflight-1",
        actionType: "EXPAND",
        origin: { x: 5, y: 5 },
        target: { x: 6, y: 5 }
      })
    });

    // The result was adopted (capture cleared as part of normal completion
    // handling), not silently dropped as a command mismatch.
    expect(state.capture).toBeUndefined();
  });

  it("leaves actionCurrent untouched (and drops the result) with no pending command reported", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws);
    expect(state.actionCurrent).toBeUndefined();

    ws.emit("message", {
      data: JSON.stringify({
        type: "FRONTIER_RESULT",
        commandId: "cmd-unrelated",
        actionType: "EXPAND",
        origin: { x: 5, y: 5 },
        target: { x: 6, y: 5 }
      })
    });

    // Still nothing adopted -- an unrelated/no-op FRONTIER_RESULT with no
    // matching pending command must keep being ignored.
    expect(state.actionCurrent).toBeUndefined();
  });

  it("does not overwrite an actionCurrent the client already has from this session", () => {
    const state = createState();
    state.actionCurrent = { x: 1, y: 1, retries: 0, commandId: "cmd-live", actionType: "EXPAND" };
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, {}, {
      nextClientSeq: 5,
      pendingCommands: [
        { commandId: "cmd-inflight-1", clientSeq: 4, type: "EXPAND", status: "ACCEPTED", queuedAt: 1_000, payload: { fromX: 5, fromY: 5, toX: 6, toY: 5 } }
      ]
    });

    expect(state.actionCurrent).toEqual(expect.objectContaining({ commandId: "cmd-live" }));
  });
});
