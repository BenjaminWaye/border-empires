import { describe, expect, it } from "vitest";
import type { ScoutDroneWorld } from "./scout-drone.js";
import { scoutDroneHomePath } from "./scout-drone-home-path.js";
import { planScoutDroneWaypointFlight, turnScoutDroneFlightHome } from "./scout-drone-route.js";

// Own land for x < 5; a rival wall down column 10 from y 15 to 30; everything else open.
const walled = (x: number, y: number): boolean => x === 10 && y >= 15 && y <= 30;
const world: ScoutDroneWorld = {
  width: 200,
  height: 120,
  classify: (x, y) => (x < 5 ? { kind: "HOME" } : walled(x, y) ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" })
};
const LAUNCH = { x: 2, y: 20 };

const chebyshev = (a: { x: number; y: number }, b: { x: number; y: number }): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
const flightMs = (path: ReadonlyArray<{ stepMs: number }>): number => path.reduce((sum, tile) => sum + tile.stepMs, 0);
const NO_LIMIT = 1_000_000;

describe("scoutDroneHomePath", () => {
  it("flies the straight line when nothing is in the way", () => {
    const path = scoutDroneHomePath({ x: 30, y: 60 }, LAUNCH, world, NO_LIMIT)!;
    expect(path).toHaveLength(chebyshev({ x: 30, y: 60 }, LAUNCH));
    expect(path.at(-1)).toMatchObject(LAUNCH);
  });

  it("goes round a rival border across the line home by the fewest tiles", () => {
    const path = scoutDroneHomePath({ x: 20, y: 25 }, LAUNCH, world, NO_LIMIT)!;
    expect(path.at(-1)).toMatchObject(LAUNCH);
    expect(path.some((tile) => walled(tile.x, tile.y))).toBe(false);
    // Up and over the top of the wall at (10, 14): 11 tiles there, 8 on home.
    expect(path).toHaveLength(19);
    let prev = { x: 20, y: 25 };
    for (const tile of path) {
      expect(chebyshev(prev, tile)).toBe(1);
      prev = tile;
    }
  });

  // Review of PR #2931: a way round with fewer tiles than the route out can still be slower, over open
  // ground at 3s a tile, than retracing over home ground at 1s; the drone then retraces.
  it("takes no way round that is not faster than `maxMs`, the time retracing would take", () => {
    const fastest = flightMs(scoutDroneHomePath({ x: 20, y: 25 }, LAUNCH, world, NO_LIMIT)!);
    expect(scoutDroneHomePath({ x: 20, y: 25 }, LAUNCH, world, fastest)).toBeUndefined();
    expect(scoutDroneHomePath({ x: 20, y: 25 }, LAUNCH, world, fastest + 1)).toBeDefined();
  });
});

describe("scout drone flights take the short way home", () => {
  const route = [{ x: 20, y: 5 }, { x: 20, y: 25 }];

  it("goes round a rival border across the line home instead of retracing the route", () => {
    const flight = planScoutDroneWaypointFlight(LAUNCH, route, 0, world)!;
    const home = flight.steps.slice(flight.turnIndex + 1);
    expect(flight.steps[flight.turnIndex]).toMatchObject({ x: 20, y: 25 });
    expect(home.at(-1)).toMatchObject(LAUNCH);
    expect(home).toHaveLength(19);
    // Not back through the first stop, the way it came (player report 2026-11-22).
    expect(home.some((step) => step.x === 20 && step.y === 5)).toBe(false);
    expect(home.some((step) => walled(step.x, step.y))).toBe(false);
  });

  it("a route ended by a rival border flies home the short way, not back along the route", () => {
    // Out past the wall's top end, then down into the wall's far side, where the border ends the route.
    const flight = planScoutDroneWaypointFlight(LAUNCH, [{ x: 20, y: 5 }, { x: 20, y: 20 }, { x: 5, y: 20 }], 0, world)!;
    expect(flight.endReason).toBe("BLOCKED");
    expect(flight.blockedByPlayerId).toBe("rival");
    const turn = flight.steps[flight.turnIndex]!;
    expect(turn).toMatchObject({ x: 11, y: 20 });
    const home = flight.steps.slice(flight.turnIndex + 1);
    expect(home.at(-1)).toMatchObject(LAUNCH);
    expect(home.some((step) => step.x === 20 && step.y === 5)).toBe(false);
    expect(home.length).toBeLessThan(flight.turnIndex);
  });

  it("retraces its route when that is faster than any way round, though the way round is fewer tiles", () => {
    // A home corridor along row 20 through rival land, from the launch out to x 40; the drone flies it
    // out, then turns in open land past its end. The straight line home crosses the rival land, and the
    // way round it is fewer tiles than the corridor but all over open land, three times slower a tile.
    const rival = (x: number, y: number): boolean => x >= 6 && x <= 39 && y >= 14 && y <= 26 && y !== 20;
    const corridor: ScoutDroneWorld = {
      width: 200,
      height: 120,
      classify: (x, y) => (x < 5 || (y === 20 && x <= 40) ? { kind: "HOME" } : rival(x, y) ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" })
    };
    const flight = planScoutDroneWaypointFlight(LAUNCH, [{ x: 40, y: 20 }, { x: 45, y: 12 }], 0, corridor)!;
    const turn = flight.steps[flight.turnIndex]!;
    expect(turn).toMatchObject({ x: 45, y: 12 });
    const outMs = turn.at - flight.launchedAt;
    // Home in no more time than the flight out took: never a slower detour.
    expect(flight.landsAt - turn.at).toBeLessThanOrEqual(outMs);
  });

  it("a recall takes the short way home too", () => {
    const flight = planScoutDroneWaypointFlight(LAUNCH, route, 0, world)!;
    const at = flight.steps.findIndex((step) => step.x === 20 && step.y === 25);
    const turned = turnScoutDroneFlightHome(flight, at, flight.steps[at]!.at, world);
    expect(turned.endReason).toBe("RECALLED");
    const home = turned.steps.slice(turned.turnIndex + 1);
    expect(home).toHaveLength(19);
    expect(home.some((step) => step.x === 20 && step.y === 5)).toBe(false);
  });
});
