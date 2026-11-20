import { describe, expect, it } from "vitest";
import type { ScoutDroneWorld } from "./scout-drone.js";
import { SCOUT_DRONE_MAX_LEG_TILES, planScoutDroneRoute, planScoutDroneWaypointFlight, scoutDroneLeg } from "./scout-drone-route.js";
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
    // 1s per open tile, 0.5s over own land (x < 5).
    const homeSteps = flight.steps.slice(1).filter((step) => step.x < 5).length;
    expect(flight.landsAt).toBe((flight.steps.length - 1 - homeSteps) * 1000 + homeSteps * 500);
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
