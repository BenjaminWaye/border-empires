import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";

// Root cause of a real bug report (waypoint gone after closing/reopening the
// browser), confirmed via two diagnostics bundles that both showed
// waypoint-restore-empty (serverProvided: false) while the client was
// actively mid-chain on a waypoint the server never knew about:
// setWaypointForSelected (client-waypoint-action-handlers.ts) and its
// siblings push to state.waypoint and sessionStorage unconditionally, but
// call `sendGameMessage?.(waypointEnqueueWirePayload(...))` without checking
// the return value or retrying. sendGameMessage returns false without
// sending anything when auth/session isn't ready yet (client-action-flow.ts's
// requireAuthedSession) -- a real window right after a reconnect. The client
// keeps walking the route fine from local memory alone (nothing depends on
// the server for progress), so nothing looks wrong until sessionStorage is
// wiped by a real tab close (by design -- that's what "session" means) with
// no server copy to fall back on.
//
// state.authSessionReady only ever flips true inside applyInitMessage
// (grep confirms no other call site), so every transition into "ready"
// passes through this exact code -- the backfill below now runs on every
// INIT, not only when state.waypoint was previously empty, closing the gap.
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

const bind = (state: any, ws: FakeWebSocket, sendGameMessage: (payload: unknown) => boolean = () => true): void => {
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
    sendGameMessage
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

describe("INIT waypoint backfill (re-sends a locally-held waypoint the server never got)", () => {
  it("re-sends WAYPOINT_ENQUEUE for a local waypoint missing from the server queue, even though state.waypoint was already non-empty", () => {
    const state = createState();
    state.waypoint = [{ target: { x: 9, y: 9 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any }];
    const ws = new FakeWebSocket();
    const sendGameMessage = vi.fn(() => true);
    bind(state, ws, sendGameMessage);

    sendInit(ws, { waypointQueue: [{ x: 5, y: 5, queuedAt: 1 }] });

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "WAYPOINT_ENQUEUE", x: 9, y: 9 });
    // Restore itself is still skipped when state.waypoint was non-empty -- only the backfill runs.
    expect(state.waypoint).toEqual([{ target: { x: 9, y: 9 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } }]);
  });

  it("does not re-send a local waypoint the server already has", () => {
    const state = createState();
    state.waypoint = [{ target: { x: 5, y: 5 }, plan: { reachable: true, path: [], expandCount: 0, attackCount: 0 } as any }];
    const ws = new FakeWebSocket();
    const sendGameMessage = vi.fn(() => true);
    bind(state, ws, sendGameMessage);

    sendInit(ws, { waypointQueue: [{ x: 5, y: 5, queuedAt: 1 }] });

    expect(sendGameMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: "WAYPOINT_ENQUEUE" }));
  });
});
