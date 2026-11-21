import { describe, expect, it } from "vitest";
import { SCOUT_DRONE_HOME_STEP_MS, SCOUT_DRONE_STEP_MS, speedUpScoutDroneFlight, type ScoutDroneWorld } from "./scout-drone.js";
import { SCOUT_DRONE_MAX_LEG_TILES, planScoutDroneRoute, planScoutDroneWaypointFlight, scoutDroneLeg, turnScoutDroneFlightHome, extendScoutDroneFlight } from "./scout-drone-route.js";
import { SCOUT_DRONE_CHARGE_REFILL_MS, SCOUT_DRONE_MAX_CHARGES, nextScoutChargeAt, scoutChargesAvailable } from "./scout-drone-charges.js";

const W = 200;
const H = 120;
// Own land for x < 5, a rival on row 40 from x >= 30, everything else open.
const world: ScoutDroneWorld = {
  width: W,
  height: H,
  classify: (x, y) => (x < 5 ? { kind: "HOME" } : y === 40 && x >= 30 ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" })
};

describe("scoutDroneLeg", () => {
  it("pulls a stop that is out of range back to the last tile in range", () => {
    const leg = scoutDroneLeg({ x: 10, y: 5 }, { x: 60, y: 5 }, world);
    expect(leg.clamped).toBe(true);
    expect(leg.end).toEqual({ x: 10 + SCOUT_DRONE_MAX_LEG_TILES, y: 5 });
    expect(leg.tiles).toHaveLength(SCOUT_DRONE_MAX_LEG_TILES);
  });

  it("doesn't count own land toward the range", () => {
    const leg = scoutDroneLeg({ x: 0, y: 5 }, { x: 60, y: 5 }, world);
    // 4 home tiles (x 1..4), then 20 open ones.
    expect(leg.end).toEqual({ x: 4 + SCOUT_DRONE_MAX_LEG_TILES, y: 5 });
  });

  it("stops one tile short of a rival border", () => {
    const leg = scoutDroneLeg({ x: 35, y: 30 }, { x: 35, y: 50 }, world);
    expect(leg.end).toEqual({ x: 35, y: 39 });
    expect(leg.blocked).toMatchObject({ ownerId: "rival", x: 35, y: 40 });
  });
});

describe("planScoutDroneRoute", () => {
  it("chains legs from each stop as reached", () => {
    const route = planScoutDroneRoute({ x: 2, y: 5 }, [{ x: 15, y: 5 }, { x: 15, y: 60 }], world);
    expect(route.stops).toEqual([{ x: 15, y: 5 }, { x: 15, y: 5 + SCOUT_DRONE_MAX_LEG_TILES }]);
  });

  it("drops the stops after a rival border", () => {
    const route = planScoutDroneRoute({ x: 35, y: 30 }, [{ x: 35, y: 50 }, { x: 50, y: 50 }], world);
    expect(route.stops).toEqual([{ x: 35, y: 39 }]);
  });
});

describe("planScoutDroneWaypointFlight", () => {
  it("flies out through the stops, then straight home on a new line", () => {
    const flight = planScoutDroneWaypointFlight({ x: 2, y: 5 }, [{ x: 15, y: 5 }, { x: 15, y: 15 }], 0, world)!;
    const turn = flight.steps[flight.turnIndex]!;
    expect(turn).toMatchObject({ x: 15, y: 15 });
    expect(flight.waypoints).toEqual([{ x: 15, y: 5 }, { x: 15, y: 15 }]);
    // Home leg is the diagonal back, not the way it came.
    const home = flight.steps.slice(flight.turnIndex + 1);
    expect(home.at(-1)).toMatchObject({ x: 2, y: 5 });
    expect(home.some((step) => step.x === 15 && step.y === 5)).toBe(false);
    expect(flight.endReason).toBe("TARGET");
    // SCOUT_DRONE_STEP_MS per open tile, SCOUT_DRONE_HOME_STEP_MS over own land (x < 5): out, a leg
    // is paced by the tile it flies into; home, by the tile it flies out of.
    const legMs = flight.steps.slice(1).map((step, i) => ((i + 1 <= flight.turnIndex ? step : flight.steps[i]!).x < 5 ? SCOUT_DRONE_HOME_STEP_MS : SCOUT_DRONE_STEP_MS));
    expect(flight.landsAt).toBe(legMs.reduce((sum, ms) => sum + ms, 0));
  });

  it("retraces its route home when a rival border ends it", () => {
    const flight = planScoutDroneWaypointFlight({ x: 2, y: 30 }, [{ x: 20, y: 30 }, { x: 35, y: 30 }, { x: 35, y: 50 }], 0, world)!;
    expect(flight.endReason).toBe("BLOCKED");
    expect(flight.blockedByPlayerId).toBe("rival");
    const out = flight.steps.slice(0, flight.turnIndex + 1).map(({ x, y }) => `${x},${y}`);
    const back = flight.steps.slice(flight.turnIndex).map(({ x, y }) => `${x},${y}`);
    expect(back).toEqual([...out].reverse());
  });

  it("can't launch with nowhere to go", () => {
    expect(planScoutDroneWaypointFlight({ x: 35, y: 39 }, [{ x: 35, y: 50 }], 0, world)).toBeUndefined();
  });
});

describe("scout drone charges", () => {
  it("each spent charge comes back after the refill time", () => {
    const charges = { max: SCOUT_DRONE_MAX_CHARGES, usedAt: [0, 1000, 2000] };
    expect(scoutChargesAvailable(charges, 5000)).toBe(SCOUT_DRONE_MAX_CHARGES - 3);
    expect(nextScoutChargeAt(charges, 5000)).toBe(SCOUT_DRONE_CHARGE_REFILL_MS);
    expect(scoutChargesAvailable(charges, SCOUT_DRONE_CHARGE_REFILL_MS + 1500)).toBe(SCOUT_DRONE_MAX_CHARGES - 1);
    expect(nextScoutChargeAt({ usedAt: [] }, 0)).toBeUndefined();
  });
});

describe("turnScoutDroneFlightHome", () => {
  it("flies straight home from where it turned instead of retracing the route", () => {
    const flight = planScoutDroneWaypointFlight({ x: 2, y: 5 }, [{ x: 15, y: 5 }, { x: 15, y: 15 }], 0, world)!;
    const turnAt = flight.steps.findIndex((step) => step.x === 15 && step.y === 10);
    const turned = turnScoutDroneFlightHome(flight, turnAt, flight.steps[turnAt]!.at, world);
    expect(turned.endReason).toBe("RECALLED");
    const home = turned.steps.slice(turned.turnIndex + 1);
    expect(home.at(-1)).toMatchObject({ x: 2, y: 5 });
    // Straight back diagonally: it never revisits the first stop.
    expect(home.some((step) => step.x === 15 && step.y === 5)).toBe(false);
    expect(turned.landsAt).toBeLessThan(flight.landsAt);
  });

  it("names the border that turned it back", () => {
    const flight = planScoutDroneWaypointFlight({ x: 2, y: 30 }, [{ x: 20, y: 30 }], 0, world)!;
    const turned = turnScoutDroneFlightHome(flight, 5, 5000, world, { ownerId: "rival", x: 8, y: 30 });
    expect(turned).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival" });
    expect(turned.steps.at(-1)).toMatchObject({ x: 2, y: 30 });
  });
});

describe("extendScoutDroneFlight", () => {
  const base = () => planScoutDroneWaypointFlight({ x: 2, y: 5 }, [{ x: 15, y: 5 }], 0, world)!;

  it("while flying out, finishes its stops, then flies the new ones, then home", () => {
    const flight = base();
    const now = flight.steps[4]!.at + 100;
    const ext = extendScoutDroneFlight(flight, now, [{ x: 15, y: 15 }], world)!;
    expect(ext.newStopsReached).toBe(1);
    expect(ext.flight.waypoints).toEqual([{ x: 15, y: 5 }, { x: 15, y: 15 }]);
    expect(ext.flight.steps[ext.flight.turnIndex]).toMatchObject({ x: 15, y: 15 });
    // What it already flew keeps its times.
    expect(ext.flight.steps.slice(0, 6)).toEqual(flight.steps.slice(0, 6));
    expect(ext.flight.steps.at(-1)).toMatchObject({ x: 2, y: 5 });
  });

  it("on its way home, turns from where it is to the new stop", () => {
    const flight = base();
    const now = flight.steps[flight.turnIndex + 3]!.at + 100;
    const ext = extendScoutDroneFlight(flight, now, [{ x: 12, y: 20 }], world)!;
    const turn = ext.flight.steps[ext.flight.turnIndex]!;
    expect(turn).toMatchObject({ x: 12, y: 20 });
    expect(ext.flight.endReason).toBe("TARGET");
    expect(ext.flight.waypoints).toEqual([{ x: 15, y: 5 }, { x: 12, y: 20 }]);
  });

  it("does nothing once landed", () => {
    const flight = base();
    expect(extendScoutDroneFlight(flight, flight.landsAt, [{ x: 15, y: 15 }], world)).toBeUndefined();
  });
});

describe("review regressions", () => {
  it("a rival border just past the range limit doesn't end the route", () => {
    // Rival land from x = 31 on row 5: the first leg is pulled back at x = 30 before it.
    const edge: ScoutDroneWorld = { width: W, height: H, classify: (x, y) => (x < 5 ? { kind: "HOME" } : y === 5 && x >= 31 ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" }) };
    const leg = scoutDroneLeg({ x: 10, y: 5 }, { x: 60, y: 5 }, edge);
    expect(leg).toMatchObject({ clamped: true, end: { x: 30, y: 5 } });
    expect(leg.blocked).toBeUndefined();
    const route = planScoutDroneRoute({ x: 10, y: 5 }, [{ x: 60, y: 5 }, { x: 30, y: 15 }], edge);
    expect(route.stops).toEqual([{ x: 30, y: 5 }, { x: 30, y: 15 }]);
  });

  it("stops abandoned by a turn-back don't come back when stops are added", () => {
    const flight = planScoutDroneWaypointFlight({ x: 2, y: 5 }, [{ x: 15, y: 5 }, { x: 15, y: 15 }], 0, world)!;
    const turnAt = flight.steps.findIndex((step) => step.x === 10 && step.y === 5);
    const recalled = turnScoutDroneFlightHome(flight, turnAt, flight.steps[turnAt]!.at, world);
    expect(recalled.waypoints).toEqual([]);
    const extended = extendScoutDroneFlight(recalled, flight.steps[turnAt]!.at + 10, [{ x: 10, y: 20 }], world)!;
    expect(extended.flight.waypoints).toEqual([{ x: 10, y: 20 }]);
  });

  it("the straight flight home is paced so the speed-up check finds nothing to change", () => {
    // An allied strip at x 8..9 mid-way home: the leg off it onto open ground must already be at the
    // pace speedUpScoutDroneFlight would give it (it judges a return leg by the tile flown out of).
    const strip: ScoutDroneWorld = { width: W, height: H, classify: (x) => (x < 5 || x === 8 || x === 9 ? { kind: "HOME" } : { kind: "OPEN" }) };
    const flight = planScoutDroneWaypointFlight({ x: 2, y: 5 }, [{ x: 15, y: 5 }, { x: 15, y: 25 }], 0, strip)!;
    const isHome = (x: number, y: number): boolean => strip.classify(x, y).kind === "HOME";
    expect(speedUpScoutDroneFlight(flight, flight.steps[flight.turnIndex]!.at, isHome)).toBeUndefined();
  });
});
