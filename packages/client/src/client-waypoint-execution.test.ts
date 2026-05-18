import { describe, expect, it } from "vitest";

import { topUpFromWaypoint } from "./client-queue-logic.js";
import { createInitialState } from "./client-state.js";
import type { ClientState } from "./client-state.js";
import type { Tile } from "./client-types.js";

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
});
