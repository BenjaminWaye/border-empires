import { describe, expect, it } from "vitest";
import {
  SCOUT_DRONE_HOME_STEP_MS,
  SCOUT_DRONE_MAX_RANGE_TILES,
  SCOUT_DRONE_STEP_MS,
  planScoutDroneFlight,
  scoutDroneLine,
  scoutDronePositionAt,
  scoutDroneStepIndexAt,
  type ScoutDroneWorld
} from "./scout-drone.js";

const W = 100;
const H = 60;
// Own land for x < 5, a rival from x >= 30 on row 10, everything else open.
const world = (overrides: Partial<ScoutDroneWorld> = {}): ScoutDroneWorld => ({
  width: W,
  height: H,
  classify: (x, y) => (x < 5 ? { kind: "HOME" } : y === 10 && x >= 30 ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" }),
  ...overrides
});

describe("scoutDroneLine", () => {
  it("includes both ends and steps one tile at a time", () => {
    const line = scoutDroneLine({ x: 0, y: 0 }, { x: 4, y: 2 }, W, H);
    expect(line[0]).toEqual({ x: 0, y: 0 });
    expect(line.at(-1)).toEqual({ x: 4, y: 2 });
    expect(line).toHaveLength(5);
  });

  it("takes the short way across the map's wrap seam", () => {
    const line = scoutDroneLine({ x: 98, y: 5 }, { x: 2, y: 5 }, W, H);
    expect(line.map((t) => t.x)).toEqual([98, 99, 0, 1, 2]);
  });
});

describe("planScoutDroneFlight", () => {
  it("flies to the target and back along the same tiles", () => {
    const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 8, y: 0 }, 1_000, world())!;
    expect(flight.endReason).toBe("TARGET");
    expect(flight.steps[flight.turnIndex]).toMatchObject({ x: 8, y: 0 });
    expect(flight.steps.at(-1)).toMatchObject({ x: 0, y: 0 });
    expect(flight.steps).toHaveLength(17);
    // 4 home tiles quickly, 4 open tiles at Expand To pace, each way.
    const oneWay = 4 * SCOUT_DRONE_HOME_STEP_MS + 4 * SCOUT_DRONE_STEP_MS;
    expect(flight.landsAt).toBe(1_000 + 2 * oneWay);
  });

  it("turns back after the range limit past the player's land", () => {
    const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 40, y: 0 }, 0, world())!;
    expect(flight.endReason).toBe("RANGE");
    expect(flight.steps[flight.turnIndex]!.x).toBe(4 + SCOUT_DRONE_MAX_RANGE_TILES);
  });

  it("turns back at the range limit when that comes before a far border", () => {
    const flight = planScoutDroneFlight({ x: 0, y: 10 }, { x: 40, y: 10 }, 0, world())!;
    expect(flight.endReason).toBe("RANGE");
    expect(flight.blockedByPlayerId).toBeUndefined();
    expect(flight.steps[flight.turnIndex]!.x).toBe(19);
  });

  it("reports the blocking border when it comes before the range limit", () => {
    const near = world({ classify: (x) => (x < 5 ? { kind: "HOME" } : x >= 9 ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" }) });
    const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 20, y: 0 }, 0, near)!;
    expect(flight.endReason).toBe("BLOCKED");
    expect(flight.steps[flight.turnIndex]!.x).toBe(8);
    expect(flight).toMatchObject({ blockedByPlayerId: "rival", blockedAtX: 9, blockedAtY: 0 });
  });

  it("cannot launch when the first tile past the AFC is blocked", () => {
    const walled = world({ classify: () => ({ kind: "BLOCKED", ownerId: "rival" }) });
    expect(planScoutDroneFlight({ x: 0, y: 0 }, { x: 5, y: 0 }, 0, walled)).toBeUndefined();
  });
});

describe("drone position", () => {
  const flight = planScoutDroneFlight({ x: 3, y: 0 }, { x: 7, y: 0 }, 0, world())!;

  it("knows which step it is over", () => {
    expect(scoutDroneStepIndexAt(flight, -1)).toBe(-1);
    expect(scoutDroneStepIndexAt(flight, flight.steps[2]!.at)).toBe(2);
  });

  it("eases between tiles and reports the return leg", () => {
    const mid = (flight.steps[2]!.at + flight.steps[3]!.at) / 2;
    const out = scoutDronePositionAt(flight, mid, W, H)!;
    expect(out.x).toBeCloseTo(5.5);
    expect(out.returning).toBe(false);
    const back = scoutDronePositionAt(flight, flight.steps[flight.turnIndex + 1]!.at, W, H)!;
    expect(back.returning).toBe(true);
    expect(scoutDronePositionAt(flight, flight.landsAt, W, H)).toBeUndefined();
  });
});
