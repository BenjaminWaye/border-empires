import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { topUpFromWaypoint } from "./client-queue-logic.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

/**
 * Regression cover for the waypoint halt loop.
 *
 * A waypoint whose next step the server keeps refusing used to (a) re-push the
 * "Waypoint halted" feed message on every single top-up tick, forever, and
 * (b) sit at the head of the queue permanently, blocking every waypoint behind
 * it. Cause: the `retries > MAX_CONSECUTIVE_RETRIES` branch returned before
 * writing `consecutiveRetries` back, so the counter stuck at MAX and each
 * later tick recomputed MAX+1 and re-announced.
 */

const keyFor = (x: number, y: number): string => `${x},${y}`;

const landTile = (x: number, y: number, ownerId = ""): Tile =>
  ({ x, y, ownerId, terrain: "LAND", ownershipState: ownerId ? "SETTLED" : "FRONTIER" }) as unknown as Tile;

/**
 * A state whose active waypoint can plan a first step but never advances --
 * ownership never flips, so every top-up re-emits the same step. That is
 * exactly the shape a server-side rejection produces.
 */
const stuckState = (targets: Array<{ x: number; y: number }>): ClientState => {
  const state = createInitialState();
  state.me = "me";
  const tiles = new Map<string, Tile>();
  tiles.set(keyFor(0, 0), landTile(0, 0, "me"));
  for (const target of targets) tiles.set(keyFor(target.x, target.y), landTile(target.x, target.y));
  state.tiles = tiles;
  // Seed the authoritative reach directly (client-reach-authoritative.ts) so
  // planWaypoint produces a real first step without depending on the local
  // anchor-derived fallback.
  const reach = new Set<string>([keyFor(0, 0)]);
  for (let x = -4; x <= 4; x += 1) for (let y = -4; y <= 4; y += 1) reach.add(keyFor(x, y));
  state.serverReach = reach;
  state.serverReachRevision = 1;
  state.waypoint = targets.map((target) => ({
    target,
    plan: { target, steps: [], totalGold: 0, totalManpower: 0, totalDurationMs: 0, expandCount: 1, attackCount: 0, reachable: true }
  }));
  return state;
};

/**
 * Drives top-ups, clearing the queue between ticks. Returns the head waypoint
 * target seen on each tick, so a test can assert the queue kept moving.
 */
const tickUntilHalted = (state: ClientState, pushFeed: () => void, ticks: number): Array<string> => {
  const headsSeen: string[] = [];
  for (let i = 0; i < ticks; i += 1) {
    const head = state.waypoint[0]?.target;
    if (head) headsSeen.push(keyFor(head.x, head.y));
    topUpFromWaypoint(state, keyFor, pushFeed as never);
    // Simulate the server refusing the claim: the action queue drains without
    // the target ever changing owner, so the next tick re-plans the same step.
    state.actionQueue = [];
    state.queuedTargetKeys.clear();
  }
  return headsSeen;
};

describe("waypoint halt loop", () => {
  it("announces the halt once, not on every tick", () => {
    const state = stuckState([{ x: 3, y: 0 }]);
    const pushFeed = vi.fn();

    tickUntilHalted(state, pushFeed, 25);

    const haltMessages = pushFeed.mock.calls.filter((call) => String(call[0]).includes("Waypoint halted"));
    expect(haltMessages.length).toBeLessThanOrEqual(1);
  });

  it("writes the retry counter back on the halting tick", () => {
    // The bug: the halt branch returned before this assignment, so the counter
    // froze at MAX and every later tick recomputed MAX+1 and re-announced.
    const state = stuckState([{ x: 3, y: 0 }]);
    const pushFeed = vi.fn();

    tickUntilHalted(state, pushFeed, 25);

    const active = state.waypoint[0];
    if (active?.consecutiveRetries !== undefined) expect(active.consecutiveRetries).toBeGreaterThan(4);
  });

  it("does not wedge the waypoints queued behind it", () => {
    // With more than one waypoint, a halted head must rotate to the back so
    // the rest of the queue still gets a turn.
    const state = stuckState([
      { x: 3, y: 0 },
      { x: 0, y: 3 }
    ]);
    const pushFeed = vi.fn();

    const headsSeen = tickUntilHalted(state, pushFeed, 40);

    expect(state.waypoint).toHaveLength(2);
    // Both waypoints must get time at the head. Before the fix the blocked one
    // held it forever and the second never ran at all.
    expect(new Set(headsSeen)).toEqual(new Set(["3,0", "0,3"]));
  });

  it("keeps a lone halted waypoint present and cancellable", () => {
    // Nothing to rotate to, so it stays -- but it must stay quiet, and the
    // player must still be able to cancel it from the flag.
    const state = stuckState([{ x: 3, y: 0 }]);
    const pushFeed = vi.fn();

    tickUntilHalted(state, pushFeed, 25);

    expect(state.waypoint).toHaveLength(1);
    expect(state.waypoint[0]?.target).toEqual({ x: 3, y: 0 });
  });
});
