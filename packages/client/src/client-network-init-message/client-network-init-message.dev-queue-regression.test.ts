import { describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";

// Regression coverage for a real bug report: repeating BUILD_INVALID "tile
// already has structure" errors after reconnect. Root cause: the server's
// durable dev-queue can carry a "ghost" BUILD entry for a tile whose build
// already completed (the DEV_QUEUE_CANCEL meant to clear it got dropped on a
// flaky connection), and applyInitMessage's post-merge queue filter used to
// skip validation entirely for entries sourced fresh from that server mirror.
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

describe("INIT dev-queue merge regression", () => {
  it("drops a server-mirrored BUILD entry once the tile already has that structure", () => {
    const state = createState();
    state.tiles.set("5,5", { x: 5, y: 5, ownerId: "player-1", ownershipState: "SETTLED", fort: { ownerId: "player-1", status: "active" } });
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, {
      devQueue: [{ tileKey: "5,5", x: 5, y: 5, kind: "BUILD", structureType: "FORT", queuedAt: 1 }]
    });

    expect(state.developmentQueue).toEqual([]);
  });

  it("keeps a server-mirrored BUILD entry when the structure does not exist yet", () => {
    const state = createState();
    state.tiles.set("5,5", { x: 5, y: 5, ownerId: "player-1", ownershipState: "SETTLED" });
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, {
      devQueue: [{ tileKey: "5,5", x: 5, y: 5, kind: "BUILD", structureType: "FORT", queuedAt: 1 }]
    });

    expect(state.developmentQueue).toHaveLength(1);
    expect(state.developmentQueue[0]).toMatchObject({ tileKey: "5,5", kind: "BUILD" });
  });

  it("keeps a server-mirrored entry for a tile this client hasn't cached yet (fresh login on a new device)", () => {
    const state = createState();
    // Some other owned tile is cached so state.tiles.size > 0 and the filter
    // actually runs, but the queue's own target tile ("9,9") is not.
    state.tiles.set("1,1", { x: 1, y: 1, ownerId: "player-1", ownershipState: "SETTLED" });
    const ws = new FakeWebSocket();
    bind(state, ws);

    sendInit(ws, {
      devQueue: [{ tileKey: "9,9", x: 9, y: 9, kind: "SETTLE", queuedAt: 1 }]
    });

    expect(state.developmentQueue).toHaveLength(1);
    expect(state.developmentQueue[0]).toMatchObject({ tileKey: "9,9", kind: "SETTLE" });
  });
});
