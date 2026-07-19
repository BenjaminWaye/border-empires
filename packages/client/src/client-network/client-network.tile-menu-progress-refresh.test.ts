import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "./client-network.js";

// Regression for forts (and other structures) that appeared to "never
// finish": TILE_DELTA only forced a renderHud() when it resolved a queued
// frontier capture, so a fort flipping from under_construction to active
// while its tile-detail popup was open landed in state.tiles but the popup
// kept rendering its stale "Fortification under construction... 00:00" view
// until some unrelated event happened to re-render the HUD.

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

const createState = (renderHud: () => void, tileActionMenu: { visible: boolean; mode: "single" | "bulk"; currentTileKey: string }) =>
  ({
    authSessionReady: true,
    selected: { x: 79, y: 240 },
    pendingCollectVisibleKeys: new Set<string>(),
    tiles: new Map([
      [
        "79,240",
        {
          x: 79,
          y: 240,
          terrain: "LAND",
          fogged: false,
          ownerId: "me",
          ownershipState: "SETTLED",
          detailLevel: "full",
          fort: { ownerId: "me", status: "under_construction", completesAt: Date.now() - 1 }
        }
      ]
    ]),
    incomingAttacksByTile: new Map(),
    settleProgressByTile: new Map(),
    me: "me",
    tileActionMenu,
    tileDetailRequestedAt: new Map<string, number>(),
    tileDetailReceivedAt: new Map<string, number>(),
    discoveredTiles: new Set<string>(),
    discoveredDockTiles: new Set<string>(),
    actionInFlight: false,
    actionTargetKey: "",
    actionQueue: [],
    queuedTargetKeys: new Set<string>(),
    frontierSyncWaitUntilByTarget: new Map<string, number>(),
    frontierLateAckUntilByTarget: new Map<string, number>(),
    upkeepLastTick: { foodCoverage: 1 },
    renderHudCalledMarker: renderHud
  }) as any;

const bind = (state: any, ws: FakeWebSocket, renderHud: () => void): void => {
  bindClientNetwork({
    state,
    ws: ws as unknown as WebSocket,
    wsUrl: "ws://localhost:3001/ws",
    keyFor: (x: number, y: number) => `${x},${y}`,
    renderHud,
    setAuthStatus: vi.fn(),
    syncAuthOverlay: vi.fn(),
    authenticateSocket: vi.fn(async () => {}),
    pushFeed: vi.fn(),
    pushFeedEntry: vi.fn(),
    clearOptimisticTileState: vi.fn(),
    requestViewRefresh: vi.fn(),
    applyPendingSettlementsFromServer: vi.fn(),
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
    dropQueuedTargetKeyIfAbsent: vi.fn(),
    processActionQueue: vi.fn(() => false),
    clearSettlementProgressForTile: vi.fn(),
    terrainAt: vi.fn(() => "LAND"),
    requestTileDetailIfNeeded: vi.fn(),
    requestAttackPreviewForTarget: vi.fn(),
    openSingleTileActionMenu: vi.fn(),
    isTileOwnedByAlly: vi.fn(() => false),
    hideShardAlert: vi.fn(),
    explainActionFailure: vi.fn((code: string, message: string) => `${code}:${message}`),
    notifyInsufficientGoldForFrontierAction: vi.fn(),
    clearSettlementProgressByKey: vi.fn(),
    showCollectVisibleCooldownAlert: vi.fn(),
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue: vi.fn(),
    revertOptimisticVisibleCollectDelta: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    settlementProgressForTile: vi.fn(() => undefined)
  } as any);
};

describe("client network TILE_DELTA refreshes an open tile menu", () => {
  it("forces a renderHud() when a TILE_DELTA completes a fort on the currently open single-tile menu", () => {
    const renderHud = vi.fn();
    const state = createState(renderHud, { visible: true, mode: "single", currentTileKey: "79,240" });
    const ws = new FakeWebSocket();
    bind(state, ws, renderHud);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, fortJson: JSON.stringify({ ownerId: "me", status: "active" }) }]
      })
    });

    expect(state.tiles.get("79,240")?.fort).toEqual({ ownerId: "me", status: "active" });
    expect(renderHud).toHaveBeenCalled();
  });

  it("does not force an extra renderHud() from TILE_DELTA when no tile menu is open", () => {
    const renderHud = vi.fn();
    const state = createState(renderHud, { visible: false, mode: "single", currentTileKey: "79,240" });
    const ws = new FakeWebSocket();
    bind(state, ws, renderHud);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [{ x: 79, y: 240, fortJson: JSON.stringify({ ownerId: "me", status: "active" }) }]
      })
    });

    expect(state.tiles.get("79,240")?.fort).toEqual({ ownerId: "me", status: "active" });
    expect(renderHud).not.toHaveBeenCalled();
  });
});
