import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { acceptedAttackTargets, acceptedMusterMarchCommands, makePlayer } from "./muster-march-test-support.js";

// Split out of muster-march.test.ts (file-line-limit) -- these cover the
// candidate-ranking regressions (world wrap, free-territory double-counting,
// obstacle-aware routing) rather than the core dispatch behavior covered
// there.
describe("muster MARCH auto-fire routing", () => {
  // REGRESSION: MARCH scored candidates using chebyshevDistanceSimple, which
  // does not account for the world's toroidal wrap, even though the module
  // doc explicitly promises a "toroidal Chebyshev distance". A flag near one
  // edge marching toward a target near the opposite edge is actually close by
  // wrap, but the un-wrapped distance made both the flag and the only
  // reachable candidate look ~440 tiles from the target instead of ~10 and ~6
  // respectively. Since the candidate's (wrong) distance-to-target came out
  // *larger* than the flag's own (wrong) distance-to-target, the "never move
  // away from the target" progress gate rejected the only candidate outright,
  // so the flag reported no target in range despite a real, short wrap-around
  // route being available.
  //
  // Before the fix this test fails: no attack command is emitted at all.
  it("routes across the world wrap seam toward a target on the opposite edge", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", makePlayer("player-1")],
        ["player-2", makePlayer("player-2")]
      ]),
      initialState: {
        tiles: [
          {
            x: 445,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 5, targetY: 10, updatedAt: 1_000 }
          },
          // Owned corridor running east, wrapping around the world edge.
          { x: 446, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 447, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 448, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 449, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    expect(acceptedAttackTargets(seen)).toEqual(["449,10"]);
  });

  // REGRESSION: MARCH's candidate score used to add the BFS hop-count from
  // the flag to the candidate into the ranking, alongside the remaining
  // straight-line distance to the target. That double-counted already-owned
  // (free) ground as if it cost the same as a future capture: a candidate
  // one hop off to the side of the flag could tie a candidate reached via a
  // longer *already-owned* corridor that continues straight toward the
  // target, and the tie-break (whichever the BFS happened to discover
  // first) then picked the sideways detour over the strictly better
  // straight continuation.
  //
  // Before the fix this test fails: MARCH fires on (9,11), a sideways
  // detour, instead of (10,12), which continues straight down the already-
  // owned corridor and needs one fewer future capture to reach the target.
  it("prefers continuing straight down an owned corridor over an equal-scoring sideways detour", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 10, targetY: 13, updatedAt: 1_000 }
          },
          { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          // Sideways detour: one hop from the flag directly.
          { x: 9, y: 11, terrain: "LAND", ownershipState: "FRONTIER" },
          // Straight continuation: one hop from the already-owned (10,11),
          // and one tile closer to the target than the sideways detour is.
          { x: 10, y: 12, terrain: "LAND", ownershipState: "FRONTIER" }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    const commands = acceptedMusterMarchCommands(seen);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.actionType).toBe("EXPAND");
    expect(commands[0]?.targetX).toBe(10);
    expect(commands[0]?.targetY).toBe(12);
  });

  // REGRESSION / feature: MARCH used to estimate the remaining leg to the
  // target as a straight-line (Chebyshev) distance, which can't tell that a
  // wall of impassable terrain sits between a candidate and the target. This
  // generalizes the BFS-frontier-expansion pathfinding pattern from the
  // client's road network builder into a real terrain-flood distance field
  // (buildTerrainDistanceField), so MARCH routes around obstacles instead of
  // guessing.
  //
  // A wall of WATER blocks a straight run east from the flag. Candidate
  // (1,0) looks closer to the target by straight-line distance than
  // candidate (1,4), but (1,0)'s route is forced into a long detour around
  // the wall (real distance 12), while (1,4) already sits close to the gap
  // past the wall with a much shorter real route (real distance 8). Before
  // this fix, MARCH would fire on (1,0) -- picking the candidate that's
  // actually the longer real route because the straight-line estimate
  // couldn't see the wall in the way.
  it("routes around an impassable obstacle instead of guessing a blocked straight line", () => {
    const WALL_X = 3;
    const isWall = (x: number, y: number) => x === WALL_X && y >= -5 && y <= 5;

    const overrides = new Map<string, Record<string, unknown>>();
    overrides.set("0,0", {
      x: 0,
      y: 0,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      muster: { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 6, targetY: 0, updatedAt: 1_000 }
    });
    for (let y = 1; y <= 5; y += 1) {
      overrides.set(`0,${y}`, { x: 0, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
    }

    const tiles: Array<Record<string, unknown>> = [];
    for (let x = -1; x <= 7; x += 1) {
      for (let y = -7; y <= 8; y += 1) {
        const key = `${x},${y}`;
        if (overrides.has(key)) continue;
        tiles.push(
          isWall(x, y)
            ? { x, y, terrain: "WATER", ownershipState: "FRONTIER" }
            : { x, y, terrain: "LAND", ownershipState: "FRONTIER" }
        );
      }
    }
    tiles.push(...overrides.values());

    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: { tiles: tiles as never, activeLocks: [] }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));

    runtime.tickMuster(1_000);

    const commands = acceptedMusterMarchCommands(seen);
    expect(commands).toHaveLength(1);
    expect(commands[0]?.actionType).toBe("EXPAND");
    expect(commands[0]?.targetX).toBe(1);
    expect(commands[0]?.targetY).toBe(4);
  });
});
