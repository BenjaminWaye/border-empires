import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { bindWithDeps, FakeWebSocket } from "./client-network.error-regression.test-helpers.js";

const emit = (ws: FakeWebSocket, msg: Record<string, unknown>): void => ws.emit("message", { data: JSON.stringify(msg) });

const startAttack = (state: ReturnType<typeof createInitialState>, commandId: string, clientSeq: number, x: number): void => {
  state.actionInFlight = true;
  state.actionStartedAt = Date.now();
  state.actionCurrent = { x, y: 11, retries: 0, clientSeq, commandId, actionType: "ATTACK" };
  state.actionTargetKey = `${x},11`;
  state.capture = { startAt: Date.now(), resolvesAt: Date.now() + 15_000, target: { x, y: 11 }, actionType: "ATTACK" };
};

describe("client-network concurrent manual attacks", () => {
  // Moved from client-network.gateway-sync-regression.test.ts (over the
  // 500-line cap): COMBAT_START.result is kept in full for the reveal, now on
  // the detached attack instead of the single pendingCombatReveal slot.
  it("keeps the full locked combat result from COMBAT_START.result on the detached attack", () => {
    const state = createInitialState();
    state.me = "player-1";
    state.tiles.set("10,10", { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
    state.tiles.set("10,11", { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
    const ws = new FakeWebSocket();
    const combatResolutionAlert = vi.fn(() => ({ title: "Victory", detail: "Won with plunder.", tone: "success", manpowerLoss: 42 }));
    bindWithDeps(state, ws, { combatResolutionAlert });
    startAttack(state, "cmd-9", 9, 10);
    const result = {
      attackType: "ATTACK", attackerWon: true, winnerId: "player-1", defenderOwnerId: "player-2",
      origin: { x: 10, y: 10 }, target: { x: 10, y: 11 },
      changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }],
      pointsDelta: 18, manpowerDelta: -42, pillagedGold: 12.5, pillagedShare: 0.25, pillagedStrategic: { TITANIUM: 3 },
      atkEff: 17, defEff: 11, winChance: 0.72, levelDelta: 0
    };
    emit(ws, { type: "COMBAT_START", commandId: "cmd-9", clientSeq: 9, origin: { x: 10, y: 10 }, target: { x: 10, y: 11 }, resolvesAt: 2_250, result });

    expect(combatResolutionAlert).toHaveBeenCalledWith(
      expect.objectContaining({ pointsDelta: 18, manpowerDelta: -42, pillagedGold: 12.5, pillagedStrategic: { TITANIUM: 3 }, atkEff: 17, defEff: 11, winChance: 0.72 }),
      expect.anything()
    );
    expect(state.detachedAttacksByCommandId.get("cmd-9")).toEqual(
      expect.objectContaining({
        targetX: 10, targetY: 11, resolvesAt: 2_250,
        lockedResult: expect.objectContaining({ pointsDelta: 18, manpowerDelta: -42, pillagedGold: 12.5, pillagedStrategic: { TITANIUM: 3 } })
      })
    );
    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.capture).toBeUndefined();
    expect(state.outgoingMusterAttacksByTile.get("10,11")).toMatchObject({ originX: 10, originY: 10, resolvesAt: 2_250 });
  });

  // Regression: a second attack could not launch until the first one's
  // combat lock resolved, because the first kept the dispatch slot; and once
  // a second was in the slot, the first one's COMBAT_RESULT was dropped as a
  // command mismatch.
  it("frees the slot on COMBAT_START and still applies the first attack's result while a second is in flight", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const state = createInitialState();
    state.me = "player-1";
    state.authSessionReady = true;
    for (const x of [10, 20]) {
      state.tiles.set(`${x},10`, { x, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
      state.tiles.set(`${x},11`, { x, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" });
    }
    const ws = new FakeWebSocket();
    const processActionQueue = vi.fn(() => false);
    bindWithDeps(state, ws, { processActionQueue, combatResolutionAlert: vi.fn(() => ({ title: "Victory", detail: "Captured.", tone: "success" })) });

    startAttack(state, "cmd-1", 1, 10);
    emit(ws, { type: "COMBAT_START", commandId: "cmd-1", clientSeq: 1, origin: { x: 10, y: 10 }, target: { x: 10, y: 11 }, resolvesAt: 16_000 });

    expect(state.actionInFlight).toBe(false);
    expect(state.detachedAttacksByCommandId.has("cmd-1")).toBe(true);
    expect(processActionQueue).toHaveBeenCalled();

    startAttack(state, "cmd-2", 2, 20);
    emit(ws, {
      type: "COMBAT_RESULT",
      commandId: "cmd-1",
      clientSeq: 1,
      attackType: "ATTACK",
      attackerWon: true,
      origin: { x: 10, y: 10 },
      target: { x: 10, y: 11 },
      changes: [{ x: 10, y: 11, ownerId: "player-1", ownershipState: "FRONTIER" }]
    });

    expect(state.tiles.get("10,11")?.ownerId).toBe("player-1");
    expect(state.detachedAttacksByCommandId.has("cmd-1")).toBe(false);
    expect(state.actionInFlight).toBe(true);
    expect(state.actionCurrent?.commandId).toBe("cmd-2");
    expect(state.capture?.target).toEqual({ x: 20, y: 11 });
    vi.restoreAllMocks();
  });
});
