import { describe, expect, it } from "vitest";

import { baseDeps, stateWith, tile } from "./client-waypoint-planner-fixtures.js";
import { planWaypoint } from "./client-waypoint-planner.js";

// Dock-pair routing cases, split out of client-waypoint-planner.test.ts (which
// is at the 500-line cap). These all exercise the same question: does the A*
// actually consider the free sea crossing between two linked docks?
describe("planWaypoint dock routing", () => {
  it("uses dock pairs to reach a tile across impassable terrain", () => {
    // (5,5)me dock A linked to (40,40) dock B. Target (41,40) adjacent to dock B.
    const tiles = [
      tile(5, 5, { ownerId: "me", dockId: "dockA" }),
      tile(40, 40, { dockId: "dockB" }),
      tile(41, 40)
    ];
    const state = stateWith(tiles, "me", {
      dockPairs: [{ ax: 5, ay: 5, bx: 40, by: 40 }]
    });
    const plan = planWaypoint({ x: 41, y: 40 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    // Path: owned dock -> dock B (EXPAND, viaDock) -> target (EXPAND).
    expect(plan.steps.length).toBe(2);
    expect(plan.steps[0]!.viaDock).toBe(true);
    expect(plan.steps[0]!.target).toEqual({ x: 40, y: 40 });
    expect(plan.steps[1]!.target).toEqual({ x: 41, y: 40 });
  });

  it("reaches an unexplored target whose only path is a dock jump (not just the 8-way and reconstruction passes)", () => {
    // (5,5)me dock A linked to (40,40) dock B, which is itself the unexplored
    // target — not in state.tiles at all. All three A* traversal points
    // (8-way neighbors, dock jumps, path reconstruction) must agree that an
    // unexplored goal is optimistically NEUTRAL, or this path is missed.
    const tiles = [tile(5, 5, { ownerId: "me", dockId: "dockA" })];
    const state = stateWith(tiles, "me", {
      dockPairs: [{ ax: 5, ay: 5, bx: 40, by: 40 }]
    });
    const plan = planWaypoint({ x: 40, y: 40 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0]!.viaDock).toBe(true);
    expect(plan.steps[0]!.target).toEqual({ x: 40, y: 40 });
  });

  it("crosses via the dock instead of walking unexplored ground from the nearest owned tile", () => {
    // The reported bug: clicking a connected dock across the water planned a
    // long EXPAND chain from whichever owned tile sat closest to the target,
    // straight through undiscovered terrain, instead of the one-step landing
    // on the dock itself. A homeland blob gives the search a second, nearer
    // frontier to walk from -- the single-owned-tile dock cases above cannot
    // catch this, because there the dock route is the only route.
    const tiles = [tile(5, 5, { ownerId: "me", dockId: "dockA" })];
    for (let x = 2; x <= 8; x += 1) {
      for (let y = 2; y <= 8; y += 1) {
        if (x === 5 && y === 5) continue;
        tiles.push(tile(x, y, { ownerId: "me" }));
      }
    }
    const state = stateWith(tiles, "me", {
      dockPairs: [{ ax: 5, ay: 5, bx: 40, by: 40 }]
    });
    // (40,40) is the linked dock: undiscovered, so every intermediate tile of
    // the tempting land route classifies as optimistically-neutral too.
    const plan = planWaypoint({ x: 40, y: 40 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps.length).toBe(1);
    expect(plan.steps[0]!.viaDock).toBe(true);
    expect(plan.steps[0]!.origin).toEqual({ x: 5, y: 5 });
    expect(plan.steps[0]!.target).toEqual({ x: 40, y: 40 });
  });
});
