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

describe("scoutDroneHomePath", () => {
  it("flies the straight line when nothing is in the way", () => {
    const path = scoutDroneHomePath({ x: 30, y: 60 }, LAUNCH, world, 1_000)!;
    expect(path).toHaveLength(chebyshev({ x: 30, y: 60 }, LAUNCH));
    expect(path.at(-1)).toMatchObject(LAUNCH);
  });

  it("goes round a rival border across the line home by the shortest way", () => {
    const path = scoutDroneHomePath({ x: 20, y: 25 }, LAUNCH, world, 1_000)!;
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

  it("gives up when there is no way home shorter than `maxSteps`", () => {
    expect(scoutDroneHomePath({ x: 20, y: 25 }, LAUNCH, world, 19)).toBeUndefined();
  });
});

describe("scout drone flights take the shortest way home", () => {
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

  it("a route ended by a rival border flies home the shortest way, not back along the route", () => {
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

  it("a recall takes the shortest way home too", () => {
    const flight = planScoutDroneWaypointFlight(LAUNCH, route, 0, world)!;
    const at = flight.steps.findIndex((step) => step.x === 20 && step.y === 25);
    const turned = turnScoutDroneFlightHome(flight, at, flight.steps[at]!.at, world);
    expect(turned.endReason).toBe("RECALLED");
    const home = turned.steps.slice(turned.turnIndex + 1);
    expect(home).toHaveLength(19);
    expect(home.some((step) => step.x === 20 && step.y === 5)).toBe(false);
  });
});
