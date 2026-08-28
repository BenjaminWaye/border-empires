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

const createState = () => ({ ...createInitialState(), playerVisualStyles: new Map<string, unknown>() }) as any;

/** Mirrors client-optimistic-state.ts's applyOptimisticTileState closely enough for this test: mutates state.tiles in place. */
const makeApplyOptimisticTileState =
  (state: any) =>
  (x: number, y: number, mutate: (tile: any) => void): void => {
    const key = `${x},${y}`;
    const current = state.tiles.get(key) ?? { x, y, terrain: "LAND" };
    const next = { ...current };
    mutate(next);
    state.tiles.set(key, next);
  };

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
    applyOptimisticTileState: makeApplyOptimisticTileState(state)
  } as any);
};

describe("onboarding checklist recomputes when an EXPAND lock starts", () => {
  it("stops highlighting a neutral town as soon as ACTION_ACCEPTED lands, without waiting for a tile-delta batch", () => {
    const state = createState();
    state.me = "player-1";
    // A neutral TOWN-tier tile the checklist is currently highlighting as
    // the EXPAND_TOWN target.
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", town: { type: "MARKET", populationTier: "TOWN" } });
    // Deliberately stale/wrong highlight, standing in for "whatever the
    // checklist last computed before this ACTION_ACCEPTED arrived" -- the
    // real bug was that nothing recomputed it at all until some later,
    // unrelated tile-delta batch happened to fire, so this array could sit
    // arbitrarily wrong (not just "not yet updated to the new correct
    // value") for the whole multi-second EXPAND resolution window.
    state.onboardingHighlightTiles = [{ x: 99, y: 99 }];
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
    // ...and the checklist recomputed right along with it, replacing the
    // stale highlight with the correct one: the town is now the player's
    // own TOWN-tier tile, so it re-appears as the food-goal anchor (a
    // different, legitimate reason -- not "still needs to be captured").
    expect(state.onboardingHighlightTiles).toEqual([{ x: 10, y: 11 }]);
  });
});
