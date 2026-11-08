import { describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { armMusterTransit } from "../client-muster-transit/client-muster-transit.js";
import { clearAllAttacksAfterCancel, detachedCombatResultPayload, detachLockedAttack, isDetachedAttackCommandId, pruneDetachedAttacks, takeDetachedAttack } from "./client-detached-attacks.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const stateWithLockedAttack = () => {
  const state = createInitialState();
  state.actionInFlight = true;
  state.actionCurrent = { x: 5, y: 5, retries: 0, actionType: "ATTACK", commandId: "cmd-1", clientSeq: 1 };
  state.actionTargetKey = "5,5";
  state.actionStartedAt = 1_000;
  state.actionAcceptedAck = true;
  state.combatStartAck = true;
  state.capture = { startAt: 1_000, resolvesAt: 20_000, target: { x: 5, y: 5 }, actionType: "ATTACK", origin: { x: 4, y: 5 } };
  state.pendingCombatReveal = { targetKey: "5,5", title: "Victory", detail: "won", tone: "success", revealed: false, result: { attackerWon: true } };
  return state;
};

const lockedMsg = { commandId: "cmd-1", target: { x: 5, y: 5 }, origin: { x: 4, y: 5 }, resolvesAt: 20_000 };

describe("detachLockedAttack", () => {
  // Regression: an accepted ATTACK held the single dispatch slot for its
  // whole combat lock, so only one attack could ever be resolving at once
  // even with several flags and plenty of manpower.
  it("frees the dispatch slot once the server locks an attack", () => {
    const state = stateWithLockedAttack();
    expect(detachLockedAttack(state, keyFor, lockedMsg, 2_000)).toBe(true);
    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.actionTargetKey).toBe("");
    expect(state.capture).toBeUndefined();
    expect(state.pendingCombatReveal).toBeUndefined();
    expect(isDetachedAttackCommandId(state, "cmd-1")).toBe(true);
    expect(state.detachedAttacksByCommandId.get("cmd-1")).toEqual({ targetX: 5, targetY: 5, resolvesAt: 20_000, lockedResult: { attackerWon: true } });
    expect(state.outgoingMusterAttacksByTile.get("5,5")).toMatchObject({ originX: 4, originY: 5, targetX: 5, targetY: 5, resolvesAt: 20_000 });
  });

  it("keeps the flag's reservation alive until the lock resolves", () => {
    const state = stateWithLockedAttack();
    armMusterTransit(state, { musterX: 3, musterY: 5, fromX: 4, fromY: 5, toX: 5, toY: 5, transitTiles: 1, manpower: 30, commandId: "cmd-1", clientSeq: 1 });
    state.deferredAttackByCommand.clear();
    state.capture = { startAt: 1_000, resolvesAt: 20_000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    detachLockedAttack(state, keyFor, lockedMsg, 2_000);
    expect(state.musterTransitByCommand.get("cmd-1")?.resolvesAt).toBe(20_000);
  });

  it("leaves an EXPAND or a different command in the slot", () => {
    const expand = stateWithLockedAttack();
    expand.capture = { startAt: 1_000, resolvesAt: 20_000, target: { x: 5, y: 5 }, actionType: "EXPAND" };
    expect(detachLockedAttack(expand, keyFor, lockedMsg)).toBe(false);
    expect(expand.actionInFlight).toBe(true);

    const other = stateWithLockedAttack();
    expect(detachLockedAttack(other, keyFor, { ...lockedMsg, commandId: "cmd-other" })).toBe(false);
    expect(other.actionCurrent?.commandId).toBe("cmd-1");
  });

  it("is bounded: expired entries are pruned and the map never passes its cap", () => {
    const state = createInitialState();
    for (let i = 0; i < 200; i += 1) {
      state.capture = { startAt: 0, resolvesAt: 10_000, target: { x: i, y: 0 }, actionType: "ATTACK" };
      detachLockedAttack(state, keyFor, { commandId: `cmd-${i}`, target: { x: i, y: 0 }, resolvesAt: 10_000 }, 1_000);
    }
    expect(state.detachedAttacksByCommandId.size).toBeLessThanOrEqual(128);
    pruneDetachedAttacks(state, 10_000 + 60_001);
    expect(state.detachedAttacksByCommandId.size).toBe(0);
  });

  it("hands back the locked result for a bare-commit COMBAT_RESULT", () => {
    const state = stateWithLockedAttack();
    detachLockedAttack(state, keyFor, lockedMsg);
    const attack = takeDetachedAttack(state, "cmd-1");
    expect(attack).toBeDefined();
    expect(isDetachedAttackCommandId(state, "cmd-1")).toBe(false);
    const msg = { type: "COMBAT_RESULT", commandId: "cmd-1" };
    expect(detachedCombatResultPayload(msg, attack!, true)).toEqual({ attackerWon: true });
    expect(detachedCombatResultPayload(msg, attack!, false)).toBe(msg);
  });

  // CANCEL_CAPTURE removes every lock the player holds server-side, so the
  // detached attacks and the reservations they hold on flags must go too.
  it("drops every detached attack and its flag reservation on COMBAT_CANCELLED, keeping unsent marches", () => {
    const state = stateWithLockedAttack();
    armMusterTransit(state, { musterX: 3, musterY: 5, fromX: 4, fromY: 5, toX: 5, toY: 5, transitTiles: 1, manpower: 30, commandId: "cmd-1", clientSeq: 1 });
    state.deferredAttackByCommand.delete("cmd-1");
    armMusterTransit(state, { musterX: 3, musterY: 5, fromX: 4, fromY: 6, toX: 5, toY: 6, transitTiles: 9, manpower: 30, commandId: "cmd-marching", clientSeq: 2 });
    state.capture = { startAt: 1_000, resolvesAt: 20_000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    state.actionCurrent = { x: 5, y: 5, retries: 0, actionType: "ATTACK", commandId: "cmd-1", clientSeq: 1 };
    detachLockedAttack(state, keyFor, lockedMsg, 2_000);

    clearAllAttacksAfterCancel(state, keyFor);

    expect(state.detachedAttacksByCommandId.size).toBe(0);
    expect(state.outgoingMusterAttacksByTile.has("5,5")).toBe(false);
    expect(state.musterTransitByCommand.has("cmd-1")).toBe(false);
    expect(state.musterTransitByCommand.has("cmd-marching")).toBe(true);
  });
});
