import { describe, expect, it } from "vitest";

import { topUpFromWaypoint } from "../client-queue-logic/client-queue-logic.js";
import { createInitialState } from "../client-state/client-state.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

const stateWithTiles = (tiles: Tile[]): ClientState => {
  const state = createInitialState();
  state.me = "me";
  for (const t of tiles) state.tiles.set(keyFor(t.x, t.y), t);
  return state;
};

describe("topUpFromWaypoint", () => {
  it("returns false and enqueues nothing when there is no active waypoint", () => {
    const state = stateWithTiles([tile(3, 3, { ownerId: "me" })]);
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(false);
    expect(state.actionQueue).toHaveLength(0);
  });

  it("does not top up while the action queue already has work", () => {
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.actionQueue.push({ x: 4, y: 3 });
    state.waypoint = {
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(false);
    expect(state.actionQueue).toHaveLength(1);
  });

  it("clears the waypoint and emits a feed entry when the target tile is now owned", () => {
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(5, 3, { ownerId: "me" })
    ]);
    state.waypoint = {
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    const messages: Array<{ message: string; severity: string | undefined }> = [];
    topUpFromWaypoint(state, keyFor, (message, _type, severity) => {
      messages.push({ message, severity });
    });
    expect(state.waypoint).toBeUndefined();
    expect(messages[0]?.message).toMatch(/waypoint reached/i);
    expect(messages[0]?.severity).toBe("success");
  });

  it("updates the plan to blocked when no path remains and enqueues nothing", () => {
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3, { terrain: "MOUNTAIN" }),
      tile(5, 3),
      tile(4, 4, { terrain: "MOUNTAIN" }),
      tile(5, 4, { terrain: "MOUNTAIN" })
    ]);
    state.waypoint = {
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(false);
    expect(state.waypoint?.plan.reachable).toBe(false);
    expect(state.actionQueue).toHaveLength(0);
  });

  it("blocks allied waypoint targets without enqueueing an attack step", () => {
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3, { ownerId: "ally" })
    ]);
    state.allies = ["ally"];
    state.waypoint = {
      target: { x: 4, y: 3 },
      plan: { target: { x: 4, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };

    const ok = topUpFromWaypoint(state, keyFor, () => {});

    expect(ok).toBe(false);
    expect(state.actionQueue).toHaveLength(0);
    expect(state.waypoint?.plan.reachable).toBe(false);
    expect(state.waypoint?.plan.blockReason).toBe("TARGET_ALLIED");
    expect(state.waypoint?.lastEnqueuedKey).toBeUndefined();
  });

  it("enqueues the first step of a reachable plan and leaves the queue with one entry", () => {
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(5, 3),
      tile(6, 3)
    ]);
    state.waypoint = {
      target: { x: 6, y: 3 },
      plan: { target: { x: 6, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(true);
    expect(state.actionQueue).toHaveLength(1);
    // First reachable step is (4,3) — the adjacent neutral.
    expect(state.actionQueue[0]).toMatchObject({ x: 4, y: 3 });
  });

  it("walks the full path end-to-end as steps complete (proves the chain advances)", () => {
    // Build a 5-tile horizontal chain: (3,3)me → (4,3) → (5,3) → (6,3) → (7,3) target.
    const tiles = [
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(5, 3),
      tile(6, 3),
      tile(7, 3)
    ];
    const state = stateWithTiles(tiles);
    state.waypoint = {
      target: { x: 7, y: 3 },
      plan: { target: { x: 7, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    const messages: string[] = [];
    const log = (message: string): void => { messages.push(message); };

    // Simulate the real loop: each iteration represents a "processActionQueue tick".
    // Between ticks we mark the just-claimed tile as owned and clear the queue,
    // exactly as the server's accept/result handlers do in production.
    const claimedOrder: string[] = [];
    for (let i = 0; i < 6 && state.waypoint; i += 1) {
      topUpFromWaypoint(state, keyFor, log);
      if (state.actionQueue.length === 0) break;
      const next = state.actionQueue[0]!;
      const k = keyFor(next.x, next.y);
      claimedOrder.push(k);
      // "Server" applies the capture: tile becomes ours, queue clears.
      const captured = state.tiles.get(k);
      if (captured) state.tiles.set(k, { ...captured, ownerId: "me" });
      state.actionQueue = [];
    }

    expect(claimedOrder).toEqual(["4,3", "5,3", "6,3", "7,3"]);
    expect(state.waypoint).toBeUndefined();
    expect(messages.some((m) => /waypoint reached/i.test(m))).toBe(true);
  });

  it("tolerates a stale-snapshot tick (same step replanned once) and then advances", () => {
    // Snapshot arriving AFTER the next topUp is the common race: the planner
    // re-emits the same step because state.tiles is briefly behind the server.
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.waypoint = {
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    // First tick: enqueue (4,3).
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.actionQueue[0]).toMatchObject({ x: 4, y: 3 });
    expect(state.waypoint?.lastEnqueuedKey).toBe("4,3");
    state.actionQueue = [];

    // Race: snapshot hasn't applied yet, so planner picks (4,3) again.
    // topUp must NOT halt — it should bump the retry counter and skip.
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.actionQueue).toHaveLength(0);
    expect(state.waypoint?.plan.reachable).toBe(true);
    expect(state.waypoint?.consecutiveRetries).toBe(1);

    // Snapshot lands; (4,3) is now ours.
    const t = state.tiles.get("4,3");
    if (t) state.tiles.set("4,3", { ...t, ownerId: "me" });

    // Next tick: planner advances to (5,3); retries reset.
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.actionQueue[0]).toMatchObject({ x: 5, y: 3 });
    expect(state.waypoint?.consecutiveRetries).toBe(0);
  });

  it("halts the plan after several consecutive retries on the same step (real reject)", () => {
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.waypoint = {
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    const messages: string[] = [];
    const log = (message: string): void => { messages.push(message); };
    topUpFromWaypoint(state, keyFor, log); // tick 1: enqueue (4,3)
    state.actionQueue = [];
    for (let i = 0; i < 5; i += 1) {
      topUpFromWaypoint(state, keyFor, log);
      state.actionQueue = [];
    }
    expect(state.waypoint?.plan.reachable).toBe(false);
    expect(messages.some((m) => /waypoint halted/i.test(m))).toBe(true);
  });

  it("retargets a tracked barbarian waypoint to a diagonally-offset relocation", () => {
    // The barbarian that was at (4,3) has moved diagonally to (3,2) — a
    // Chebyshev-ring cell that a plus-shaped (non-diagonal) scan would miss.
    const state = stateWithTiles([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(3, 2, { ownerId: "barbarian-1" })
    ]);
    state.waypoint = {
      target: { x: 4, y: 3 },
      trackBarbarian: true,
      plan: { target: { x: 4, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    };
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.waypoint?.target).toEqual({ x: 3, y: 2 });
  });
});
