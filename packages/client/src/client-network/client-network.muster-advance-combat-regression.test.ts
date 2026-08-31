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

// Regression coverage for the muster flag advance-attack animation bug
// report: (1) the pre-resolution skirmish never played for an ADVANCE-mode
// muster flag's auto-fired attack, and (2) the contested tile briefly
// flipped from the attacker back to the defender before settling.
describe("muster-advance auto-fired attack", () => {
  it("tracks the fight in outgoingMusterAttacksByTile from COMBAT_START so the skirmish can render", () => {
    const state = createState();
    state.me = "me";
    const ws = new FakeWebSocket();
    bind(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_START",
        commandId: "territory-auto:muster-advance:3,3",
        origin: { x: 3, y: 3 },
        target: { x: 4, y: 3 },
        resolvesAt: Date.now() + 25_000
      })
    });

    expect(state.outgoingMusterAttacksByTile.get("4,3")).toEqual(
      expect.objectContaining({ originX: 3, originY: 3, targetX: 4, targetY: 3 })
    );
    // Never occupies the single-slot HUD capture field a manual attack uses.
    expect(state.capture).toBeUndefined();
  });

  it("does not stamp a stale pendingCombatReveal from an unrelated earlier fight onto the muster target", () => {
    const state = createState();
    state.me = "me";
    state.tiles.set("4,3", { x: 4, y: 3, terrain: "LAND", fogged: false, ownerId: "rival", ownershipState: "FRONTIER" });
    // Leftover prediction from a completely different, earlier action.
    state.pendingCombatReveal = {
      targetKey: "10,10",
      title: "",
      detail: "",
      tone: "success",
      revealed: false,
      result: { target: { x: 10, y: 10 }, changes: [{ x: 10, y: 10, ownerId: "someone-else" }] }
    };
    const ws = new FakeWebSocket();
    bind(state, ws);

    // The server's authoritative resolution for the muster flag's own fight.
    ws.emit("message", {
      data: JSON.stringify({
        type: "COMBAT_RESULT",
        commandId: "territory-auto:muster-advance:3,3",
        attackType: "ATTACK",
        attackerWon: true,
        origin: { x: 3, y: 3 },
        target: { x: 4, y: 3 },
        changes: [{ x: 4, y: 3, ownerId: "me", ownershipState: "FRONTIER" }]
      })
    });

    // Correctly flips to the attacker and stays there -- never reverts to
    // "rival" (or, worse, to the unrelated leftover target's owner).
    expect(state.tiles.get("4,3")?.ownerId).toBe("me");
    // The unrelated tile was never touched.
    expect(state.tiles.get("10,10")).toBeUndefined();
  });
});
