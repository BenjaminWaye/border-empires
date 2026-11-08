import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { armMusterTransit } from "../client-muster-transit/client-muster-transit.js";
import { settleCombatResultSlot, type CombatResultSlotDeps } from "./client-combat-result-slot.js";

const deps = (): CombatResultSlotDeps => ({
  keyFor: (x, y) => `${x},${y}`,
  requestSettlement: vi.fn(() => false),
  pushFeed: vi.fn(),
  dropQueuedTargetKeyIfAbsent: vi.fn(),
  resumeQueuedFrontierActionsAfter: vi.fn(),
  processActionQueue: vi.fn(() => false)
});

const input = (detached: boolean) => ({
  attackType: "ATTACK",
  commandId: "cmd-1",
  target: { x: 5, y: 5 },
  resultTargetKey: "5,5",
  resultAlert: { title: "Victory", detail: "won" },
  resolvedCaptureTargetKey: "",
  predicted: false,
  detached
});

describe("settleCombatResultSlot", () => {
  // Regression: with several attacks resolving at once, the result of one
  // that already left the slot must not reset the attack now in the slot.
  it("leaves the in-flight attack alone when a detached attack resolves", () => {
    const state = createInitialState();
    armMusterTransit(state, { musterX: 3, musterY: 5, fromX: 4, fromY: 5, toX: 5, toY: 5, transitTiles: 1, manpower: 30, commandId: "cmd-1", clientSeq: 1 });
    // armMusterTransit models a fresh march; restore the slot the second attack holds.
    state.actionInFlight = true;
    state.actionCurrent = { x: 8, y: 8, retries: 0, actionType: "ATTACK", commandId: "cmd-2", clientSeq: 2 };
    state.actionTargetKey = "8,8";
    state.capture = { startAt: 0, resolvesAt: 30_000, target: { x: 8, y: 8 }, actionType: "ATTACK" };
    const d = deps();

    settleCombatResultSlot(state, input(true), d);

    expect(state.actionInFlight).toBe(true);
    expect(state.actionCurrent?.commandId).toBe("cmd-2");
    expect(state.capture?.target).toEqual({ x: 8, y: 8 });
    expect(state.musterTransitByCommand.has("cmd-1")).toBe(false);
    expect(d.processActionQueue).not.toHaveBeenCalled();
  });

  it("frees the slot and starts the next action for the attack holding it", () => {
    const state = createInitialState();
    state.actionInFlight = true;
    state.actionCurrent = { x: 5, y: 5, retries: 0, actionType: "ATTACK", commandId: "cmd-1", clientSeq: 1 };
    state.actionTargetKey = "5,5";
    state.capture = { startAt: 0, resolvesAt: 30_000, target: { x: 5, y: 5 }, actionType: "ATTACK" };
    const d = deps();

    settleCombatResultSlot(state, { ...input(false), resolvedCaptureTargetKey: "5,5" }, d);

    expect(state.actionInFlight).toBe(false);
    expect(state.capture).toBeUndefined();
    expect(state.actionCurrent).toBeUndefined();
    expect(d.processActionQueue).toHaveBeenCalledTimes(1);
  });

  // Regression (review): clearing by target let one attack's result delete a
  // second attack's march to the same tile, and its flag reservation.
  it("clears only the resolved attack's march, not another one aimed at the same tile", () => {
    const state = createInitialState();
    armMusterTransit(state, { musterX: 3, musterY: 5, fromX: 4, fromY: 5, toX: 5, toY: 5, transitTiles: 1, manpower: 30, commandId: "cmd-1", clientSeq: 1 });
    armMusterTransit(state, { musterX: 7, musterY: 5, fromX: 6, fromY: 5, toX: 5, toY: 5, transitTiles: 9, manpower: 30, commandId: "cmd-later", clientSeq: 2 });

    settleCombatResultSlot(state, input(true), deps());

    expect(state.musterTransitByCommand.has("cmd-1")).toBe(false);
    expect(state.musterTransitByCommand.has("cmd-later")).toBe(true);
    expect(state.deferredAttackByCommand.has("cmd-later")).toBe(true);
  });
});
