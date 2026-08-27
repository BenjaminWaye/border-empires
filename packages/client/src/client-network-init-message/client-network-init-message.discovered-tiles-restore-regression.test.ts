// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { bindClientNetwork } from "../client-network/client-network.js";
import { createInitialState } from "../client-state/client-state.js";
import { saveDiscoveredTiles } from "../client-state/client-discovered-tiles-storage.js";

// Regression for applyGatewayInitialState() (client-gateway-sync.ts) wiping
// discoveredTiles right back out after client-network-init-message.ts had
// just restored it from localStorage: on a non-in-session reconnect (fresh
// page load, so state.tiles/discoveredTiles start empty in memory --
// preserveDiscoveredTilesOnReconnect is false), the old code restored from
// localStorage *before* calling applyGatewayInitialState, which then cleared
// discoveredTiles down to just this INIT's own (visible-range) snapshot. A
// tile explored in a previous session but outside that snapshot rendered as
// "unexplored" instead of fogged (see client-map-facade.ts's
// discoveredTiles.has() check) until the player scrolled back to it.

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
    applyOptimisticTileState: vi.fn()
  } as any);
};

describe("client-network-init-message discovered-tiles restore regression", () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("restores previously discovered tiles from localStorage on a fresh-state reconnect INIT instead of leaving them unexplored", () => {
    saveDiscoveredTiles({
      seasonId: "rewrite-stress-10ai",
      playerId: "player-1",
      discoveredTiles: new Set(["10,11"]),
      discoveredDockTiles: new Set()
    });

    const state = createState();
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "INIT",
        player: { id: "player-1", name: "Player 1", points: 5, level: 1, stamina: 0, homeTile: { x: 10, y: 10 } },
        config: { season: { seasonId: "rewrite-stress-10ai", worldSeed: 1010 } },
        runtimeIdentity: { fingerprint: "runtime-fp-1", snapshotLabel: "snap-a" },
        initialState: {
          playerId: "player-1",
          tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
        }
      })
    });

    // Restored from localStorage even though it's outside the INIT's own
    // snapshot -- must not be reported as "unexplored".
    expect(state.discoveredTiles.has("10,11")).toBe(true);
    expect(state.discoveredTiles.has("10,10")).toBe(true);
  });
});
