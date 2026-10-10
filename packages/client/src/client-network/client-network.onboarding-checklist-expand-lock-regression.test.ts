// Regression coverage for the onboarding checklist recomputing right when
// an EXPAND's "lock" starts (ACTION_ACCEPTED / COMBAT_START, which
// optimistically flips the target tile's ownerId -- see
// applyAcceptedExpandOptimisticState in client-network.ts) instead of only
// on the next unrelated tile-delta batch. Without this, a highlighted town
// or food tile the player just committed to Expand To kept showing as
// still-highlighted for the full multi-second window the real EXPAND takes
// to resolve server-side, even though the checklist goal was effectively
// already met.
import { describe, expect, it, vi } from "vitest";
import { bindClientNetwork } from "./client-network.js";
import { createInitialState, type ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import type { RealtimeSocket, RealtimeSocketEventMap } from "../client-socket-types.js";
import { onboardingChecklistState } from "../client-onboarding-checklist/client-onboarding-checklist.js";

class FakeWebSocket implements RealtimeSocket {
  static readonly OPEN = 1;
  readyState = FakeWebSocket.OPEN;
  readonly OPEN = FakeWebSocket.OPEN;
  readonly CONNECTING = 0;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  send = vi.fn<(data: string) => void>();
  close = vi.fn<() => void>();
  reconnect = vi.fn<() => void>();
  private listeners: Array<(event: MessageEvent<string>) => void> = [];
  addEventListener<K extends keyof RealtimeSocketEventMap>(type: K, listener: (event: RealtimeSocketEventMap[K]) => void): void {
    if (type === "message") this.listeners.push(listener as (event: MessageEvent<string>) => void);
  }
  removeEventListener<K extends keyof RealtimeSocketEventMap>(type: K, listener: (event: RealtimeSocketEventMap[K]) => void): void {
    if (type === "message") this.listeners = this.listeners.filter((entry) => entry !== listener);
  }
  emit(_type: "message", event: { data: string }): void {
    for (const listener of this.listeners) listener(new MessageEvent<string>("message", event));
  }
}

const createState = (): ClientState => createInitialState();

/** Mirrors client-optimistic-state.ts's applyOptimisticTileState closely enough for this test: mutates state.tiles in place. */
const makeApplyOptimisticTileState =
  (state: ClientState) =>
  (x: number, y: number, mutate: (tile: Tile) => void): void => {
    const key = `${x},${y}`;
    const current = state.tiles.get(key) ?? { x, y, terrain: "LAND" };
    const next = { ...current };
    mutate(next);
    state.tiles.set(key, next);
  };

const bind = (state: ClientState, ws: FakeWebSocket) => {
  bindClientNetwork({
    state,
    ws,
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
    applyOptimisticTileState: makeApplyOptimisticTileState(state)
  });
};

describe("onboarding checklist recomputes when an EXPAND lock starts", () => {
  it("stops highlighting pending food as soon as ACTION_ACCEPTED lands, without waiting for a tile-delta batch", () => {
    const state = createState();
    state.me = "player-1";
    // Signed in with the tutorial closed, so the onboarding UI gate
    // (client-onboarding-ui-gate.ts) isn't holding the checklist back.
    state.authSessionReady = true;
    state.guide.open = false;
    // Food first: the AFC supplies reach to a neutral fishing tile.
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", afc: { ownerId: "player-1", status: "active" } });
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", resource: "FISH" });
    expect(onboardingChecklistState(state.tiles, state.me).highlightTiles).toEqual([{ x: 10, y: 11 }]);
    // Without recomputing, this old target survives throughout the EXPAND.
    state.onboardingHighlightTiles = [{ x: 10, y: 11 }];
    state.actionCurrent = { x: 10, y: 11, retries: 0, clientSeq: 7, commandId: "cmd-7", actionType: "EXPAND" };
    state.actionTargetKey = "10,11";

    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "ACTION_ACCEPTED",
        commandId: "cmd-7",
        actionType: "EXPAND",
        origin: { x: 10, y: 10 },
        target: { x: 10, y: 11 },
        resolvesAt: Date.now() + 15_000
      })
    });

    // The optimistic ownerId flip landed...
    expect(state.tiles.get("10,11")?.ownerId).toBe("player-1");
    // ...and the checklist recomputed right along with it.
    // This food is not actionable while the expansion is still resolving.
    expect(state.onboardingHighlightTiles).toEqual([]);
  });
});
