import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import {
  activeMusterSupplyLines,
  armMusterTransit,
  cancelUnsentMusterTransits,
  clearMusterTransitForTarget,
  fireDueMusterTransits
} from "./client-muster-transit.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

describe("client-muster-transit", () => {
  it("arms a transit without holding the actionInFlight lock", () => {
    const state = createInitialState();
    state.actionInFlight = true;
    state.actionCurrent = { x: 9, y: 9, retries: 0 };
    state.actionTargetKey = "9,9";

    armMusterTransit(state, keyFor, {
      musterX: 0,
      musterY: 0,
      fromX: 0,
      fromY: 0,
      toX: 1,
      toY: 0,
      transitTiles: 2,
      commandId: "cmd-1",
      clientSeq: 1
    });

    expect(state.musterTransitByTile.get("0,0")).toMatchObject({ musterX: 0, musterY: 0, targetX: 1, targetY: 0 });
    expect(state.deferredAttackByTile.get("0,0")).toMatchObject({ fromX: 0, fromY: 0, toX: 1, toY: 0, commandId: "cmd-1", clientSeq: 1 });
    expect(state.capture?.target).toEqual({ x: 1, y: 0 });
    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.actionTargetKey).toBe("");
  });

  it("does not fire a transit before its window elapses", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 100, commandId: "cmd-1", clientSeq: 1 });

    const sendDeferredAttack = vi.fn();
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack, requestViewRefresh: vi.fn() });

    expect(sendDeferredAttack).not.toHaveBeenCalled();
    expect(state.musterTransitByTile.has("0,0")).toBe(true);
    expect(state.deferredAttackByTile.has("0,0")).toBe(true);
  });

  it("fires a due transit, claiming actionInFlight only for the attack it sends", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-1", clientSeq: 1 });

    const sendDeferredAttack = vi.fn();
    const requestViewRefresh = vi.fn();
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack, requestViewRefresh });

    expect(sendDeferredAttack).toHaveBeenCalledWith(0, 0, 1, 0, "cmd-1", 1);
    expect(requestViewRefresh).toHaveBeenCalled();
    expect(state.actionInFlight).toBe(true);
    expect(state.actionTargetKey).toBe("1,0");
    // Deferred send is consumed, but the flag stays tracked ("locked") until
    // its combat result arrives, so the overlay keeps showing it.
    expect(state.deferredAttackByTile.has("0,0")).toBe(false);
    expect(state.musterTransitByTile.has("0,0")).toBe(true);
  });

  it("only fires one attack per tick, leaving other due flags parked until the slot frees up", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-a", clientSeq: 1 });
    armMusterTransit(state, keyFor, { musterX: 5, musterY: 5, fromX: 5, fromY: 5, toX: 6, toY: 5, transitTiles: 0, commandId: "cmd-b", clientSeq: 2 });

    const sendDeferredAttack = vi.fn();
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack, requestViewRefresh: vi.fn() });

    expect(sendDeferredAttack).toHaveBeenCalledTimes(1);
    expect(state.actionInFlight).toBe(true);
    // Whichever flag didn't fire this tick is still fully armed, waiting its turn.
    const firedKey = sendDeferredAttack.mock.calls[0]![4] === "cmd-a" ? "0,0" : "5,5";
    const parkedKey = firedKey === "0,0" ? "5,5" : "0,0";
    expect(state.deferredAttackByTile.has(parkedKey)).toBe(true);
    expect(state.musterTransitByTile.has(parkedKey)).toBe(true);

    // Simulate the first attack's slot freeing up (ack/resolution reset it
    // elsewhere) and re-tick: the parked flag now gets its turn.
    state.actionInFlight = false;
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack, requestViewRefresh: vi.fn() });
    expect(sendDeferredAttack).toHaveBeenCalledTimes(2);
    expect(state.deferredAttackByTile.has(parkedKey)).toBe(false);
  });

  it("prunes a fired flag's entry once its combat result arrives, leaving other flags untouched", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-a", clientSeq: 1 });
    armMusterTransit(state, keyFor, { musterX: 5, musterY: 5, fromX: 5, fromY: 5, toX: 6, toY: 5, transitTiles: 100, commandId: "cmd-b", clientSeq: 2 });
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });

    expect(state.musterTransitByTile.has("0,0")).toBe(true); // locked, awaiting resolution
    clearMusterTransitForTarget(state, 1, 0);

    expect(state.musterTransitByTile.has("0,0")).toBe(false);
    // The other flag, still marching toward a different target, is untouched.
    expect(state.musterTransitByTile.has("5,5")).toBe(true);
    expect(state.deferredAttackByTile.has("5,5")).toBe(true);
  });

  it("self-heals a locked entry orphaned by an unclean reset (accept-timeout, rejection, reconnect) instead of leaking forever", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-a", clientSeq: 1 });
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });
    expect(state.musterTransitByTile.has("0,0")).toBe(true);

    // No clean COMBAT_RESULT ever arrives (e.g. reset via an accept-timeout
    // or rejection path elsewhere that doesn't know about these maps).
    // Well within every legitimate recovery window, the entry must survive.
    const entry = state.musterTransitByTile.get("0,0")!;
    entry.transitEndsAt = Date.now() - 12_000;
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });
    expect(state.musterTransitByTile.has("0,0")).toBe(true);

    // Well beyond every legitimate recovery window, it's pruned so the flag
    // isn't permanently excluded from findClosestMuster.
    entry.transitEndsAt = Date.now() - 31_000;
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });
    expect(state.musterTransitByTile.has("0,0")).toBe(false);
  });

  it("cancels only unsent (still-marching) transits, leaving already-fired ones for the server-side cancel", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-a", clientSeq: 1 });
    armMusterTransit(state, keyFor, { musterX: 5, musterY: 5, fromX: 5, fromY: 5, toX: 6, toY: 5, transitTiles: 100, commandId: "cmd-b", clientSeq: 2 });
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });

    const cancelled = cancelUnsentMusterTransits(state);

    expect(cancelled).toBe(true);
    // "0,0" already fired (locked) — untouched here, cancelled server-side instead.
    expect(state.musterTransitByTile.has("0,0")).toBe(true);
    // "5,5" was still marching — cancelled locally immediately.
    expect(state.musterTransitByTile.has("5,5")).toBe(false);
    expect(state.deferredAttackByTile.has("5,5")).toBe(false);
  });

  it("reports no cancellation when every tracked flag has already fired", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-a", clientSeq: 1 });
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });

    expect(cancelUnsentMusterTransits(state)).toBe(false);
  });

  it("reports supply lines with independent transit/locked phases per flag", () => {
    const state = createInitialState();
    armMusterTransit(state, keyFor, { musterX: 0, musterY: 0, fromX: 0, fromY: 0, toX: 1, toY: 0, transitTiles: 0, commandId: "cmd-a", clientSeq: 1 });
    armMusterTransit(state, keyFor, { musterX: 5, musterY: 5, fromX: 5, fromY: 5, toX: 6, toY: 5, transitTiles: 100, commandId: "cmd-b", clientSeq: 2 });
    fireDueMusterTransits(state, { keyFor, sendDeferredAttack: vi.fn(), requestViewRefresh: vi.fn() });

    const lines = activeMusterSupplyLines(state, keyFor);
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.targetKey === "1,0")?.phase).toBe("locked");
    expect(lines.find((line) => line.targetKey === "6,5")?.phase).toBe("transit");
  });
});
