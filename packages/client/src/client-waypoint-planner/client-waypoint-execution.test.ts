import { describe, expect, it } from "vitest";
import { EXPAND_MANPOWER_COST } from "@border-empires/shared";

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

// An owned, settled tile with an active RELAY_BEACON (OUTPOST_REACH_RADIUS =
// 5) -- topUpFromWaypoint's planWaypoint call is now reach-gated
// (localReachIsInReach), so an origin tile with no real reach anchor at all
// would block every EXPAND leg. All the fixtures below stay within this
// radius (the longest chain here is 4 tiles out).
const reachAnchorTile = (x: number, y: number): Tile =>
  tile(x, y, {
    ownerId: "me",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "me", type: "RELAY_BEACON", status: "active" }
  });

describe("topUpFromWaypoint", () => {
  it("returns false and enqueues nothing when there is no active waypoint", () => {
    const state = stateWithTiles([reachAnchorTile(3, 3)]);
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(false);
    expect(state.actionQueue).toHaveLength(0);
  });

  it("does not top up while the action queue already has work", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.actionQueue.push({ x: 4, y: 3 });
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(false);
    expect(state.actionQueue).toHaveLength(1);
  });

  it("clears the waypoint when the target tile is now owned (no feed echo — commit 1ddf07f7 dropped self-action feed echoes)", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(5, 3, { ownerId: "me" })
    ]);
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const messages: Array<{ message: string; severity: string | undefined }> = [];
    topUpFromWaypoint(state, keyFor, (message, _type, severity) => {
      messages.push({ message, severity });
    });
    expect(state.waypoint).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("advances to the next queued waypoint once the current one is reached", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(5, 3, { ownerId: "me" }),
      tile(6, 3)
    ]);
    state.waypoint = [
      {
        target: { x: 5, y: 3 },
        plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
      },
      {
        target: { x: 6, y: 3 },
        plan: { target: { x: 6, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
      }
    ];
    const sent: unknown[] = [];
    const ok = topUpFromWaypoint(state, keyFor, () => {}, (payload) => {
      sent.push(payload);
      return true;
    });
    expect(ok).toBe(true);
    expect(state.waypoint).toHaveLength(1);
    expect(state.waypoint[0]?.target).toEqual({ x: 6, y: 3 });
    // The server-durable mirror (runtime-waypoint-queue.ts) must drop the
    // reached target too, or it lingers there forever across future logouts.
    expect(sent).toEqual([{ type: "WAYPOINT_CANCEL", x: 5, y: 3 }]);
  });

  it("updates the plan to blocked when no path remains and enqueues nothing", () => {
    // (5,3) fully enclosed by mountains on all 8 sides — since unexplored
    // terrain is now optimistically passable, a partial barrier would no
    // longer isolate it (there's always a way around through the
    // surrounding unexplored land), so every neighbor must be walled.
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 2, { terrain: "MOUNTAIN" }),
      tile(5, 2, { terrain: "MOUNTAIN" }),
      tile(6, 2, { terrain: "MOUNTAIN" }),
      tile(4, 3, { terrain: "MOUNTAIN" }),
      tile(6, 3, { terrain: "MOUNTAIN" }),
      tile(5, 3),
      tile(4, 4, { terrain: "MOUNTAIN" }),
      tile(5, 4, { terrain: "MOUNTAIN" }),
      tile(6, 4, { terrain: "MOUNTAIN" })
    ]);
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(false);
    expect(state.waypoint[0]?.plan.reachable).toBe(false);
    expect(state.actionQueue).toHaveLength(0);
  });

  it("cancels the waypoint and emits a feed entry once the target tile is discovered to be a mountain", () => {
    // (5,3) was unexplored when the waypoint was set (a real mountain/sea
    // target can never be known upfront); this simulates it now being
    // revealed as impassable as the player's territory approached it.
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3, { terrain: "MOUNTAIN" })
    ]);
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const messages: Array<{ message: string; severity: string | undefined }> = [];
    const sent: unknown[] = [];
    const ok = topUpFromWaypoint(
      state,
      keyFor,
      (message, _type, severity) => {
        messages.push({ message, severity });
      },
      (payload) => {
        sent.push(payload);
        return true;
      }
    );
    expect(ok).toBe(false);
    expect(state.waypoint).toHaveLength(0);
    expect(state.actionQueue).toHaveLength(0);
    expect(messages[0]?.message).toMatch(/cancelled/i);
    expect(messages[0]?.message).toMatch(/impassable/i);
    expect(sent).toEqual([{ type: "WAYPOINT_CANCEL", x: 5, y: 3 }]);
    expect(messages[0]?.severity).toBe("warn");
  });

  it("blocks allied waypoint targets without enqueueing an attack step", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3, { ownerId: "ally" })
    ]);
    state.allies = ["ally"];
    state.waypoint = [{
      target: { x: 4, y: 3 },
      plan: { target: { x: 4, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];

    const ok = topUpFromWaypoint(state, keyFor, () => {});

    expect(ok).toBe(false);
    expect(state.actionQueue).toHaveLength(0);
    expect(state.waypoint[0]?.plan.reachable).toBe(false);
    expect(state.waypoint[0]?.plan.blockReason).toBe("TARGET_ALLIED");
    expect(state.waypoint[0]?.lastEnqueuedKey).toBeUndefined();
  });

  it("enqueues the first step of a reachable plan and leaves the queue with one entry", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3),
      tile(6, 3)
    ]);
    state.waypoint = [{
      target: { x: 6, y: 3 },
      plan: { target: { x: 6, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const ok = topUpFromWaypoint(state, keyFor, () => {});
    expect(ok).toBe(true);
    expect(state.actionQueue).toHaveLength(1);
    // First reachable step is (4,3) — the adjacent neutral.
    expect(state.actionQueue[0]).toMatchObject({ x: 4, y: 3 });
  });

  it("walks the full path end-to-end as steps complete (proves the chain advances)", () => {
    // Build a 5-tile horizontal chain: (3,3)me → (4,3) → (5,3) → (6,3) → (7,3) target.
    const tiles = [
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3),
      tile(6, 3),
      tile(7, 3)
    ];
    const state = stateWithTiles(tiles);
    state.waypoint = [{
      target: { x: 7, y: 3 },
      plan: { target: { x: 7, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const messages: string[] = [];
    const log = (message: string): void => { messages.push(message); };

    // Simulate the real loop: each iteration represents a "processActionQueue tick".
    // Between ticks we mark the just-claimed tile as owned and clear the queue,
    // exactly as the server's accept/result handlers do in production.
    const claimedOrder: string[] = [];
    for (let i = 0; i < 6 && state.waypoint.length > 0; i += 1) {
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
    // state.waypoint clearing (asserted above) is itself the proof the chain
    // reached its target — commit 1ddf07f7 intentionally dropped the
    // "Waypoint reached" feed echo (self-action echoes moved out of the
    // Activity Feed), so there is no longer a message to assert on here.
    expect(state.waypoint).toHaveLength(0);
    expect(messages).toHaveLength(0);
  });

  it("tolerates a stale-snapshot tick (same step replanned once) and then advances", () => {
    // Snapshot arriving AFTER the next topUp is the common race: the planner
    // re-emits the same step because state.tiles is briefly behind the server.
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    // First tick: enqueue (4,3).
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.actionQueue[0]).toMatchObject({ x: 4, y: 3 });
    expect(state.waypoint[0]?.lastEnqueuedKey).toBe("4,3");
    state.actionQueue = [];

    // Race: snapshot hasn't applied yet, so planner picks (4,3) again.
    // topUp must NOT halt — it should bump the retry counter and skip.
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.actionQueue).toHaveLength(0);
    expect(state.waypoint[0]?.plan.reachable).toBe(true);
    expect(state.waypoint[0]?.consecutiveRetries).toBe(1);

    // Snapshot lands; (4,3) is now ours.
    const t = state.tiles.get("4,3");
    if (t) state.tiles.set("4,3", { ...t, ownerId: "me" });

    // Next tick: planner advances to (5,3); retries reset.
    topUpFromWaypoint(state, keyFor, () => {});
    expect(state.actionQueue[0]).toMatchObject({ x: 5, y: 3 });
    expect(state.waypoint[0]?.consecutiveRetries).toBe(0);
  });

  it("halts the plan after several consecutive retries on the same step (real reject)", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const messages: string[] = [];
    const log = (message: string): void => { messages.push(message); };
    topUpFromWaypoint(state, keyFor, log); // tick 1: enqueue (4,3)
    state.actionQueue = [];
    for (let i = 0; i < 5; i += 1) {
      topUpFromWaypoint(state, keyFor, log);
      state.actionQueue = [];
    }
    expect(state.waypoint[0]?.plan.reachable).toBe(false);
    expect(messages.some((m) => /waypoint halted/i.test(m))).toBe(true);
  });

  it("pauses (not halts) an EXPAND leg when manpower is insufficient, and never emits a halted message", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.manpower = EXPAND_MANPOWER_COST - 1;
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const messages: Array<{ message: string; severity: string | undefined }> = [];
    const log = (message: string, _type?: string, severity?: string): void => { messages.push({ message, severity }); };

    for (let i = 0; i < 6; i += 1) {
      const ok = topUpFromWaypoint(state, keyFor, log);
      expect(ok).toBe(false);
      expect(state.actionQueue).toHaveLength(0);
    }

    expect(state.waypoint[0]?.pausedForManpower).toBe(true);
    // Still reachable — this is a wait, not a block — and it must never be
    // relabelled as a stuck/impassable path the way the old code did.
    expect(state.waypoint[0]?.plan.reachable).toBe(true);
    expect(messages.some((m) => /halted/i.test(m.message))).toBe(false);
    // The pause message is emitted once on the transition in, not every tick.
    expect(messages.filter((m) => /paused/i.test(m.message))).toHaveLength(1);
  });

  it("resumes a manpower-paused waypoint automatically once manpower is available again", () => {
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(5, 3)
    ]);
    state.manpower = EXPAND_MANPOWER_COST - 1;
    state.waypoint = [{
      target: { x: 5, y: 3 },
      plan: { target: { x: 5, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const messages: string[] = [];
    const log = (message: string): void => { messages.push(message); };

    topUpFromWaypoint(state, keyFor, log);
    expect(state.waypoint[0]?.pausedForManpower).toBe(true);

    state.manpower = EXPAND_MANPOWER_COST;
    const ok = topUpFromWaypoint(state, keyFor, log);

    expect(ok).toBe(true);
    expect(state.waypoint[0]?.pausedForManpower).toBe(false);
    expect(state.actionQueue[0]).toMatchObject({ x: 4, y: 3 });
    expect(messages.some((m) => /resumed/i.test(m))).toBe(true);
  });

  it("retargets a tracked barbarian waypoint to a diagonally-offset relocation", () => {
    // The barbarian that was at (4,3) has moved diagonally to (3,2) — a
    // Chebyshev-ring cell that a plus-shaped (non-diagonal) scan would miss.
    const state = stateWithTiles([
      reachAnchorTile(3, 3),
      tile(4, 3),
      tile(3, 2, { ownerId: "barbarian-1" })
    ]);
    state.waypoint = [{
      target: { x: 4, y: 3 },
      trackBarbarian: true,
      plan: { target: { x: 4, y: 3 }, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 0, attackCount: 0, reachable: true }
    }];
    const sent: unknown[] = [];
    topUpFromWaypoint(state, keyFor, () => {}, (payload) => {
      sent.push(payload);
      return true;
    });
    expect(state.waypoint[0]?.target).toEqual({ x: 3, y: 2 });
    // The server-durable mirror is keyed by target coordinates -- swap it too,
    // or it keeps pointing at the barbarian's stale (4,3) position.
    expect(sent).toEqual([
      { type: "WAYPOINT_CANCEL", x: 4, y: 3 },
      { type: "WAYPOINT_ENQUEUE", x: 3, y: 2, trackBarbarian: true }
    ]);
  });
});
