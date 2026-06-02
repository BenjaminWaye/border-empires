import { FRONTIER_CLAIM_MS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";

import { planWaypoint } from "./client-waypoint-planner.js";
import type { WaypointPlannerDeps } from "./client-waypoint-planner.js";
import type { Tile } from "./client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

const tile = (x: number, y: number, overrides: Partial<Tile> = {}): Tile => ({
  x,
  y,
  terrain: "LAND",
  ...overrides
});

type StateShape = WaypointPlannerDeps["state"];

const stateWith = (tiles: Tile[], me = "me", overrides: Partial<StateShape> = {}): StateShape => ({
  me,
  tiles: new Map(tiles.map((t) => [keyFor(t.x, t.y), t])),
  dockPairs: [],
  activeTruces: [],
  ...overrides
});

const baseDeps = (state: StateShape): WaypointPlannerDeps => ({
  state,
  keyFor,
  // Flat durations so cost arithmetic is predictable in tests.
  expandDurationMsAt: () => 1000,
  attackDurationMs: 3000,
  now: 1_000_000
});

// Tiebreak tests assert on path *shape* (turns/overshoot), which only holds
// when the A* heuristic is admissible — i.e. the per-step expand cost is not
// below the heuristic's FRONTIER_CLAIM_MS lower bound (true in production).
const tiebreakDeps = (state: StateShape): WaypointPlannerDeps => ({
  state,
  keyFor,
  expandDurationMsAt: () => FRONTIER_CLAIM_MS,
  attackDurationMs: 3000,
  now: 1_000_000
});

describe("planWaypoint", () => {
  it("blocks when the planner has no owned territory", () => {
    const state = stateWith([tile(5, 5)]);
    const plan = planWaypoint({ x: 5, y: 5 }, baseDeps(state));
    expect(plan.reachable).toBe(false);
    expect(plan.blockReason).toBe("NO_OWNED_TERRITORY");
  });

  it("blocks when the target is already owned by the player", () => {
    const state = stateWith([
      tile(3, 3, { ownerId: "me" }),
      tile(5, 5, { ownerId: "me" })
    ]);
    const plan = planWaypoint({ x: 5, y: 5 }, baseDeps(state));
    expect(plan.reachable).toBe(false);
    expect(plan.blockReason).toBe("TARGET_OWN");
  });

  it("blocks when the target tile is unexplored", () => {
    const state = stateWith([tile(3, 3, { ownerId: "me" })]);
    const plan = planWaypoint({ x: 5, y: 5 }, baseDeps(state));
    expect(plan.reachable).toBe(false);
    expect(plan.blockReason).toBe("TARGET_UNEXPLORED");
  });

  it("blocks when the target is a barrier (mountain)", () => {
    const state = stateWith([
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3, { terrain: "MOUNTAIN" })
    ]);
    const plan = planWaypoint({ x: 4, y: 3 }, baseDeps(state));
    expect(plan.reachable).toBe(false);
    expect(plan.blockReason).toBe("TARGET_BARRIER");
  });

  it("blocks when the target owner is truced", () => {
    const state = stateWith(
      [
        tile(3, 3, { ownerId: "me" }),
        tile(4, 3, { ownerId: "enemy" })
      ],
      "me",
      {
        activeTruces: [
          {
            otherPlayerId: "enemy",
            otherPlayerName: "enemy",
            startedAt: 0,
            endsAt: 5_000_000,
            createdByPlayerId: "me"
          }
        ]
      }
    );
    const plan = planWaypoint({ x: 4, y: 3 }, baseDeps(state));
    expect(plan.reachable).toBe(false);
    expect(plan.blockReason).toBe("TARGET_TRUCED");
  });

  it("emits a straight-line expand chain through neutral land", () => {
    const tiles = [
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3),
      tile(5, 3),
      tile(6, 3)
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 6, y: 3 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps).toHaveLength(3);
    expect(plan.steps.map((s) => s.action)).toEqual(["EXPAND", "EXPAND", "EXPAND"]);
    expect(plan.steps[0]!.origin).toEqual({ x: 3, y: 3 });
    expect(plan.steps[0]!.target).toEqual({ x: 4, y: 3 });
    expect(plan.steps[2]!.target).toEqual({ x: 6, y: 3 });
    expect(plan.totalGold).toBe(3);
    expect(plan.totalManpower).toBe(0);
    expect(plan.totalDurationMs).toBe(3000);
    expect(plan.expandCount).toBe(3);
    expect(plan.attackCount).toBe(0);
    expect(plan.firstAttackFromExistingFrontier).toBeUndefined();
  });

  it("emits an ATTACK step when the path crosses an enemy tile", () => {
    const tiles = [
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3, { ownerId: "enemy" }),
      tile(5, 3)
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 5, y: 3 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps.map((s) => s.action)).toEqual(["ATTACK", "EXPAND"]);
    expect(plan.totalManpower).toBe(60);
    expect(plan.attackCount).toBe(1);
    expect(plan.expandCount).toBe(1);
    expect(plan.firstAttackFromExistingFrontier).toBe(true);
  });

  it("marks first attack as NEW front when it launches from an EXPAND'd tile", () => {
    // Owned(0,0) -> neutral(1,0) -> enemy(2,0). First attack origin is (1,0), expanded.
    const tiles = [
      tile(0, 0, { ownerId: "me" }),
      tile(1, 0),
      tile(2, 0, { ownerId: "enemy" })
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 2, y: 0 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps.map((s) => s.action)).toEqual(["EXPAND", "ATTACK"]);
    expect(plan.firstAttackFromExistingFrontier).toBe(false);
  });

  it("routes around a mountain barrier diagonally", () => {
    // (3,3)me  (4,3)MOUNTAIN  (5,3)target
    //           (4,4)neutral
    const tiles = [
      tile(3, 3, { ownerId: "me" }),
      tile(4, 3, { terrain: "MOUNTAIN" }),
      tile(5, 3),
      tile(4, 4),
      tile(5, 4)
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 5, y: 3 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    // 8-way adjacency means (3,3) can reach (4,4) diagonally, then (5,3).
    expect(plan.steps.length).toBeGreaterThanOrEqual(2);
    for (const step of plan.steps) {
      expect(step.target).not.toEqual({ x: 4, y: 3 });
    }
  });

  it("returns no path when the target is completely walled off", () => {
    // (5,5)me, target at (5,7), but all tiles between are mountain.
    const tiles = [
      tile(5, 5, { ownerId: "me" }),
      tile(4, 6, { terrain: "MOUNTAIN" }),
      tile(5, 6, { terrain: "MOUNTAIN" }),
      tile(6, 6, { terrain: "MOUNTAIN" }),
      tile(5, 7)
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 5, y: 7 }, baseDeps(state));
    expect(plan.reachable).toBe(false);
    expect(plan.blockReason).toBe("NO_PATH");
  });

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

  it("walks a pure diagonal target as a pure diagonal (no zigzag)", () => {
    const tiles = [tile(3, 3, { ownerId: "me" })];
    for (let i = 1; i <= 4; i += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          if (dx === 0 && dy === 0) continue;
          tiles.push(tile(3 + i * dx, 3 + i * dy));
          tiles.push(tile(3 + i, 3 + i - 1));
          tiles.push(tile(3 + i - 1, 3 + i));
        }
      }
    }
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 7, y: 7 }, tiebreakDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps).toHaveLength(4);
    expect(plan.steps.map((s) => s.target)).toEqual([
      { x: 4, y: 4 },
      { x: 5, y: 5 },
      { x: 6, y: 6 },
      { x: 7, y: 7 }
    ]);
  });

  it("prefers a straight east run over a zigzag when the goal is due east", () => {
    // Source (0,3); plenty of open tiles around. Goal (5,3) is due east.
    // Without the turn penalty, A* could pick NE-SE-NE-SE-NE (also 5 chebyshev
    // steps); the penalty makes the straight E-E-E-E-E strictly cheaper.
    const tiles: Tile[] = [tile(0, 3, { ownerId: "me" })];
    for (let x = 0; x <= 6; x += 1) {
      for (let y = 1; y <= 5; y += 1) {
        if (x === 0 && y === 3) continue;
        tiles.push(tile(x, y));
      }
    }
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 5, y: 3 }, tiebreakDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps).toHaveLength(5);
    for (const step of plan.steps) {
      expect(step.target.y).toBe(3);
    }
  });

  it("skips cut-off frontier tiles in source seeding — target only reachable from healthy tile", () => {
    // (5,3) is a healthy (SETTLED) owned tile adjacent to target.
    // (4,4) is a cut-off encircled frontier owned by me, also adjacent to target.
    // The healthy tile must be the origin of the single ATTACK step.
    const now = 1_000_000;
    const tiles = [
      tile(5, 3, { ownerId: "me", ownershipState: "SETTLED" }),
      tile(4, 4, { ownerId: "me", ownershipState: "FRONTIER", frontierDecayAt: now + 30_000, frontierDecayKind: "ENCIRCLEMENT" }),
      tile(5, 4, { ownerId: "enemy" })
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 5, y: 4 }, { ...baseDeps(state), now });
    expect(plan.reachable).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.action).toBe("ATTACK");
    // The origin must be (5,3), not (4,4).
    expect(plan.steps[0]!.origin).toEqual({ x: 5, y: 3 });
    expect(plan.steps[0]!.target).toEqual({ x: 5, y: 4 });
  });

  it("blocks when the only route to the target is through a cut-off frontier tile", () => {
    // (3,3) is a cut-off encircled frontier. Target is beyond it.
    // No healthy owned tile touches the enemy — the cut-off is the only bridge.
    const now = 1_000_000;
    const tiles = [
      tile(2, 3, { ownerId: "me", ownershipState: "SETTLED" }),
      tile(3, 3, { ownerId: "me", ownershipState: "FRONTIER", frontierDecayAt: now + 30_000, frontierDecayKind: "ENCIRCLEMENT" }),
      tile(4, 3, { ownerId: "enemy" })
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 4, y: 3 }, { ...baseDeps(state), now });
    expect(plan.reachable).toBe(false);
  });

  it("treats SETTLED tiles as valid origins (no over-exclusion)", () => {
    // SETTLED tiles are never cut off — verify they still work fine.
    const tiles = [
      tile(3, 3, { ownerId: "me", ownershipState: "SETTLED" }),
      tile(4, 3, { ownerId: "enemy" })
    ];
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 4, y: 3 }, baseDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps).toHaveLength(1);
    expect(plan.steps[0]!.origin).toEqual({ x: 3, y: 3 });
  });

  it("groups straight runs together on a mixed target (one direction change)", () => {
    // Source (0,5) to target (5,3): 5 east + 2 north over 5 chebyshev steps.
    // Expect contiguous runs (E-E-E-NE-NE or NE-NE-E-E-E), one turn, no
    // overshoot. Open field so geometry, not obstacles, drives the path.
    const tiles: Tile[] = [tile(0, 5, { ownerId: "me" })];
    for (let x = 0; x <= 6; x += 1) {
      for (let y = 1; y <= 6; y += 1) {
        if (x === 0 && y === 5) continue;
        tiles.push(tile(x, y));
      }
    }
    const state = stateWith(tiles);
    const plan = planWaypoint({ x: 5, y: 3 }, tiebreakDeps(state));
    expect(plan.reachable).toBe(true);
    expect(plan.steps).toHaveLength(5);
    // No overshoot: y stays within [3, 5] the whole way.
    for (const step of plan.steps) {
      expect(step.target.y).toBeGreaterThanOrEqual(3);
      expect(step.target.y).toBeLessThanOrEqual(5);
    }
    // Exactly one direction change between consecutive steps.
    let turns = 0;
    for (let i = 1; i < plan.steps.length; i += 1) {
      const a = plan.steps[i - 1]!;
      const b = plan.steps[i]!;
      if (
        a.target.x - a.origin.x !== b.target.x - b.origin.x ||
        a.target.y - a.origin.y !== b.target.y - b.origin.y
      ) {
        turns += 1;
      }
    }
    expect(turns).toBe(1);
  });
});
