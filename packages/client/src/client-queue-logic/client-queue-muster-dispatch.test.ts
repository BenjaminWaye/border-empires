import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { dispatchMusterFundedAttack, type MusterAttackDispatchDeps } from "./client-queue-muster-dispatch.js";

// Regression for staging 2026-10-19: once the muster filled, the queued attack
// fired from the flag while an enemy was attacking the flag's own tile, and
// the server refused it LOCKED. It must wait for the siege to end instead.

const NOW = 2_000_000;

// The "already told the player" memory is module-level, so each test besieges
// with its own end time to stay independent of test order.
const setup = (besieged: boolean, siegeMs = 12_000) => {
  const state = createInitialState();
  state.me = "me";
  const flag: Tile = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", muster: { ownerId: "me", amount: 999, mode: "HOLD", updatedAt: 0 } };
  const target: Tile = { x: 6, y: 5, terrain: "LAND", ownerId: "enemy", ownershipState: "SETTLED" };
  state.tiles.set("5,5", flag);
  state.tiles.set("6,5", target);
  if (besieged) state.incomingAttacksByTile.set("5,5", { attackerName: "Ai-13", resolvesAt: NOW + siegeMs });
  // processActionQueue has already shifted the entry and marked it in flight.
  state.queuedTargetKeys.add("6,5");
  state.actionInFlight = true;
  state.actionTargetKey = "6,5";
  state.actionCurrent = { x: 6, y: 5, retries: 0, actionType: "ATTACK" };
  const feed: string[] = [];
  const deps: MusterAttackDispatchDeps = {
    keyFor: (x, y) => `${x},${y}`,
    isAdjacent: (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by)) === 1,
    pushFeed: (message) => feed.push(message),
    renderHud: () => {},
    sendSetMuster: () => {}
  };
  const input = { entry: { x: 6, y: 5, retries: 0 }, from: flag, to: target, targetKey: "6,5", commandId: "c-1", clientSeq: 1 };
  return { state, deps, input, feed };
};

describe("dispatchMusterFundedAttack", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it("holds the attack until a besieged flag is free instead of firing into a LOCKED rejection", () => {
    const { state, deps, input, feed } = setup(true);
    dispatchMusterFundedAttack(state, input, deps);
    expect(state.musterTransitByTile.size).toBe(0);
    expect(state.actionInFlight).toBe(false);
    expect(state.actionCurrent).toBeUndefined();
    expect(state.actionQueue).toEqual([input.entry]);
    expect(state.queuedTargetKeys.has("6,5")).toBe(true);
    expect(state.frontierSyncWaitUntilByTarget.get("6,5")).toBeGreaterThanOrEqual(NOW + 12_000);
    expect(feed).toEqual(["Muster at (5, 5) is under siege by Ai-13 — attack on (6, 5) will launch when it's free in 12s."]);
  });

  it("tells the player once per siege, not on every queue pass", () => {
    const { state, deps, input, feed } = setup(true, 13_000);
    dispatchMusterFundedAttack(state, input, deps);
    state.actionQueue.length = 0;
    dispatchMusterFundedAttack(state, input, deps);
    expect(feed).toHaveLength(1);
  });

  it("marches from the flag as before when nothing is attacking it", () => {
    const { state, deps, input } = setup(false);
    dispatchMusterFundedAttack(state, input, deps);
    expect(state.musterTransitByTile.has("5,5")).toBe(true);
    expect(state.deferredAttackByTile.get("5,5")).toMatchObject({ fromX: 5, fromY: 5, toX: 6, toY: 5 });
    expect(state.actionQueue).toEqual([]);
  });
});
