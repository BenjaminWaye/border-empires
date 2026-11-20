import { describe, expect, it } from "vitest";
import {
  SCOUT_DRONE_HOME_STEP_MS,
  SCOUT_DRONE_STEP_MS,
  planScoutDroneFlight,
  scoutDroneBlockAt,
  scoutDroneLine,
  scoutDronePositionAt,
  scoutDroneStepIndexAt,
  speedUpScoutDroneFlight,
  turnScoutDroneFlightBack,
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

  // Playtest 2026-11-20: a 15-tile range limit meant a drone never reached a rival
  // ~70 tiles away, so an island start could never find anyone to fight.
  it("has no range limit: a far target is reached, it just takes longer", () => {
    const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 45, y: 0 }, 0, world())!;
    expect(flight.endReason).toBe("TARGET");
    expect(flight.steps[flight.turnIndex]!.x).toBe(45);
    // 4 home tiles quickly, 41 open tiles at Expand To pace, each way.
    expect(flight.landsAt).toBe(2 * (4 * SCOUT_DRONE_HOME_STEP_MS + 41 * SCOUT_DRONE_STEP_MS));
  });

  it("crosses a wide own empire without turning back", () => {
    const wide = world({ classify: (x) => (x < 90 ? { kind: "HOME" } : { kind: "OPEN" }) });
    const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 95, y: 0 }, 0, { ...wide, width: 200 })!;
    expect(flight.endReason).toBe("TARGET");
    expect(flight.steps[flight.turnIndex]!.x).toBe(95);
  });

  it("flies on until a far border turns it back", () => {
    const flight = planScoutDroneFlight({ x: 0, y: 10 }, { x: 40, y: 10 }, 0, world())!;
    expect(flight.endReason).toBe("BLOCKED");
    expect(flight).toMatchObject({ blockedByPlayerId: "rival", blockedAtX: 30, blockedAtY: 10 });
    expect(flight.steps[flight.turnIndex]!.x).toBe(29);
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

describe("rival borders the drone cannot slip through", () => {
  // Rival tiles at (1, 0) and (0, 1) close the corner between (0, 0) and (1, 1).
  const corner = world({ classify: (x, y) => ((x === 1 && y === 0) || (x === 0 && y === 1) ? { kind: "BLOCKED", ownerId: "rival" } : { kind: "OPEN" }) });

  it("treats a diagonal step between two rival tiles as blocked", () => {
    expect(scoutDroneBlockAt({ x: 0, y: 0 }, { x: 1, y: 1 }, corner)).toMatchObject({ ownerId: "rival" });
    expect(scoutDroneBlockAt({ x: 2, y: 2 }, { x: 3, y: 3 }, corner)).toBeUndefined();
    expect(planScoutDroneFlight({ x: 0, y: 0 }, { x: 2, y: 2 }, 0, corner)).toBeUndefined();
  });

  it("turns a flight back early, keeping each leg's length", () => {
    const flight = planScoutDroneFlight({ x: 0, y: 0 }, { x: 10, y: 0 }, 0, world())!;
    const now = flight.steps[6]!.at + 500;
    const turned = turnScoutDroneFlightBack(flight, 6, now, { ownerId: "rival", x: 7, y: 0 });
    expect(turned).toMatchObject({ endReason: "BLOCKED", blockedByPlayerId: "rival", blockedAtX: 7, turnIndex: 6 });
    expect(turned.steps.at(-1)).toMatchObject({ x: 0, y: 0 });
    expect(turned.landsAt - now).toBe(flight.steps[6]!.at - flight.steps[0]!.at);
  });
});


describe("ground that becomes home mid-flight", () => {
  // AFC (2,10) -> 3,4 home -> 5..8 open, then back.
  const plan = () => planScoutDroneFlight({ x: 2, y: 10 }, { x: 8, y: 10 }, 0, world())!;

  it("jumps the drone forward over it, out and home, never past the tile it is flying toward", () => {
    const flight = plan();
    const legInto6 = flight.steps.findIndex((s) => s.x === 6);
    const now = flight.steps[legInto6 - 1]!.at + 2_000; // 2s into the 7.5s leg toward x=6
    const faster = speedUpScoutDroneFlight(flight, now, (x) => x <= 7)!;
    expect(faster).toBeDefined();
    // The leg in progress ends at least now (no snap past it), later legs over x<=7 take home pace.
    expect(faster.steps[legInto6]!.at).toBe(now);
    expect(faster.steps[legInto6 + 1]!.at - faster.steps[legInto6]!.at).toBe(SCOUT_DRONE_HOME_STEP_MS);
    // x=8 is still open: the leg into it and the leg back out of it keep Expand To pace.
    expect(faster.steps[faster.turnIndex]!.at - faster.steps[faster.turnIndex - 1]!.at).toBe(SCOUT_DRONE_STEP_MS);
    expect(faster.steps[faster.turnIndex + 1]!.at - faster.steps[faster.turnIndex]!.at).toBe(SCOUT_DRONE_STEP_MS);
    expect(faster.landsAt).toBe(faster.steps.at(-1)!.at);
    expect(faster.landsAt).toBeLessThan(flight.landsAt);
    expect(faster.steps.map((s) => [s.x, s.y])).toEqual(flight.steps.map((s) => [s.x, s.y]));
    expect(scoutDronePositionAt(faster, now, W, H)!.x).toBeGreaterThanOrEqual(scoutDronePositionAt(flight, now, W, H)!.x);
  });

  it("changes nothing when no slow leg ahead is home", () => {
    const flight = plan();
    expect(speedUpScoutDroneFlight(flight, flight.steps[3]!.at, (x) => x < 5)).toBeUndefined();
  });
});
