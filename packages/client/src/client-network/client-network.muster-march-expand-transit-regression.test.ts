import { describe, expect, it, vi } from "vitest";

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

// Regression coverage for the MARCH-mode travel-animation bug report: a
// muster flag fighting its way through neutral ground toward its march
// target (maybeMarchFire's neutral-tile EXPAND fallback) made real progress
// every tick server-side, but never showed any movement client-side. Unlike
// an auto-fired ATTACK -- which gets a second chance via COMBAT_START (see
// the muster-advance-combat-regression test) -- the gateway never emits
// COMBAT_START for EXPAND, so ACTION_ACCEPTED was the only broadcast for
// this leg, and it was being silently dropped by the requireActionInFlight
// gate (this client never submitted the auto-fired command, so it has no
// matching actionCurrent).
describe("muster-march auto-fired EXPAND", () => {
  it("tracks the neutral-tile expand in outgoingMusterAttacksByTile from ACTION_ACCEPTED so the travel animation can render", () => {
    const state = createState();
    state.me = "me";
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ACTION_ACCEPTED",
        actionType: "EXPAND",
        commandId: "territory-auto:muster-march:5,5",
        origin: { x: 4, y: 3 },
        target: { x: 5, y: 3 },
        musterOrigin: { x: 3, y: 3 },
        resolvesAt: Date.now() + 15_000,
        transitEndsAt: Date.now() + 2_000
      })
    });

    expect(state.outgoingMusterAttacksByTile.get("5,3")).toEqual(
      expect.objectContaining({
        originX: 4,
        originY: 3,
        targetX: 5,
        targetY: 3,
        musterOriginX: 3,
        musterOriginY: 3
      })
    );
    // Never occupies the single-slot HUD capture field a manual action uses.
    expect(state.capture).toBeUndefined();
  });

  it("does not swallow a manually-dispatched EXPAND's own ACTION_ACCEPTED", () => {
    const state = createState();
    state.me = "me";
    state.actionCurrent = { x: 7, y: 7, retries: 0, commandId: "my-own-manual-expand", actionType: "EXPAND", clientSeq: 1 };
    state.actionStartedAt = Date.now();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ACTION_ACCEPTED",
        actionType: "EXPAND",
        commandId: "my-own-manual-expand",
        clientSeq: 1,
        origin: { x: 6, y: 7 },
        target: { x: 7, y: 7 },
        resolvesAt: Date.now() + 15_000
      })
    });

    expect(state.outgoingMusterAttacksByTile.has("7,7")).toBe(false);
    expect(state.capture).toEqual(expect.objectContaining({ target: { x: 7, y: 7 } }));
  });
});
