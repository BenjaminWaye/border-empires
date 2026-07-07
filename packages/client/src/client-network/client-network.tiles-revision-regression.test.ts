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
    clearPendingCollectVisibleDelta: vi.fn(),
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
    showCollectVisibleCooldownAlert: vi.fn(),
    formatCooldownShort: vi.fn(() => "1s"),
    reconcileActionQueue: vi.fn(),
    revertOptimisticVisibleCollectDelta: vi.fn(),
    revertOptimisticTileCollectDelta: vi.fn(),
    clearPendingCollectTileDelta: vi.fn(),
    playerNameForOwner: vi.fn(),
    applyOptimisticTileState: vi.fn()
  } as any);
};

// Regression coverage for a live bug: an encirclement-cleared frontier tile
// (or any ownership change delivered outside TILE_DELTA_BATCH) updated
// state.tiles correctly but never bumped state.tilesRevision, which is the
// only signal client-map-3d's rebuild loop watches for. The map kept
// rendering the stale ownership fill until an unrelated camera move or a
// full page refresh forced a rebuild.
describe("client network tiles revision regression", () => {
  it("bumps tilesRevision when a singular TILE_DELTA update clears tile ownership", () => {
    const state = createState();
    state.me = "me";
    state.tiles.set("12,18", {
      x: 12,
      y: 18,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "FRONTIER",
      detailLevel: "summary"
    });
    const revisionBefore = state.tilesRevision;
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "TILE_DELTA",
        updates: [
          {
            x: 12,
            y: 18,
            terrain: "LAND",
            fogged: false,
            ownerId: null,
            ownershipState: null,
            detailLevel: "summary"
          }
        ]
      })
    });

    expect(state.tiles.get("12,18")?.ownerId).toBeUndefined();
    expect(state.tilesRevision).toBeGreaterThan(revisionBefore);
  });

  it("bumps tilesRevision when a COMBAT_RESULT change clears tile ownership (encirclement/attack)", () => {
    const state = createState();
    state.me = "me";
    state.tiles.set("10,11", {
      x: 10,
      y: 11,
      terrain: "LAND",
      fogged: false,
      ownerId: "me",
      ownershipState: "FRONTIER"
    });
    const revisionBefore = state.tilesRevision;
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_RESULT",
        commandId: "cmd-1",
        attackType: "ATTACK",
        attackerWon: true,
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        changes: [{ x: 10, y: 11, ownerId: null, ownershipState: null }]
      })
    });

    expect(state.tiles.get("10,11")?.ownerId).toBeUndefined();
    expect(state.tilesRevision).toBeGreaterThan(revisionBefore);
  });
});
