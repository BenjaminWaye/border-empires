import { describe, expect, it } from "vitest";
import { MUSTER_TRANSIT_MS_PER_TILE } from "../config.js";
import { MUSTER_TRANSIT_MAX_TILES } from "../muster-config.js";
import { MUSTER_SAIL_MAX_MS, MUSTER_SAIL_MIN_MS, MUSTER_SAIL_MS_PER_TILE, musterSailMs, planMusterTransitRoute, type TransitPoint } from "./muster-transit-route.js";

// Two land masses split by a channel of sea at y 20..29: an island to the
// north (y < 20) and the mainland to the south (y >= 30), with a dock pair
// at (10,19) and (40,30) -- well to the side of the straight line.
const isLand = (_x: number, y: number): boolean => y < 20 || y >= 30;
const docks = new Map<string, TransitPoint[]>([
  ["10,19", [{ x: 40, y: 30 }, { x: 41, y: 30 }]],
  ["40,30", [{ x: 10, y: 19 }]]
]);
const crossingsFrom = (x: number, y: number) => docks.get(`${x},${y}`);

describe("planMusterTransitRoute", () => {
  it("walks straight over land, timed like the old straight-line distance", () => {
    const route = planMusterTransitRoute({ from: { x: 5, y: 5 }, to: { x: 9, y: 7 }, isPassable: isLand, crossingsFrom, maxSteps: 60 });
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]!.kind).toBe("WALK");
    expect(route.transitMs).toBe(4 * MUSTER_TRANSIT_MS_PER_TILE);
  });

  it("keeps the one-tile floor for a flag firing from its own tile", () => {
    const route = planMusterTransitRoute({ from: { x: 5, y: 5 }, to: { x: 5, y: 5 }, isPassable: isLand, crossingsFrom, maxSteps: 60 });
    expect(route.transitMs).toBe(MUSTER_TRANSIT_MS_PER_TILE);
  });

  it("marches to the dock, sails, and marches out instead of crossing the sea", () => {
    const from = { x: 12, y: 15 };
    const to = { x: 38, y: 33 };
    const route = planMusterTransitRoute({ from, to, isPassable: isLand, crossingsFrom, maxSteps: 60 });
    expect(route.legs.map((leg) => leg.kind)).toEqual(["WALK", "SAIL", "WALK"]);
    const [walkIn, sail, walkOut] = route.legs;
    if (walkIn!.kind !== "WALK" || sail!.kind !== "SAIL" || walkOut!.kind !== "WALK") throw new Error("unexpected legs");
    expect(walkIn.points[0]).toEqual(from);
    expect(walkIn.points.at(-1)).toEqual({ x: 10, y: 19 });
    expect(sail.from).toEqual({ x: 10, y: 19 });
    expect(walkOut.points.at(-1)).toEqual(to);
    // No walked tile is ever sea.
    for (const leg of [walkIn, walkOut]) for (const point of leg.points) expect(isLand(point.x, point.y)).toBe(true);
    // Walk 4 to the dock + 3 from the landing = 7 tiles, plus the crossing.
    const walkTiles = walkIn.points.length - 1 + walkOut.points.length - 1;
    expect(route.transitMs).toBe(walkTiles * MUSTER_TRANSIT_MS_PER_TILE + musterSailMs(sail.from, sail.to));
    expect(route.legMs.reduce((a, b) => a + b, 0)).toBe(route.transitMs);
  });

  it("charges the crossing by the distance sailed, with a floor for boarding", () => {
    expect(musterSailMs({ x: 0, y: 0 }, { x: 1, y: 1 })).toBe(MUSTER_SAIL_MIN_MS);
    expect(musterSailMs({ x: 0, y: 0 }, { x: 0, y: 20 })).toBe(20 * MUSTER_SAIL_MS_PER_TILE);
  });

  it("caps the marching time but still adds the crossing", () => {
    const route = planMusterTransitRoute({ from: { x: 10, y: 0 }, to: { x: 40, y: 50 }, isPassable: isLand, crossingsFrom, maxSteps: 120 });
    const sail = route.legs.find((leg) => leg.kind === "SAIL");
    if (!sail || sail.kind !== "SAIL") throw new Error("expected a crossing");
    expect(route.transitMs).toBe(MUSTER_TRANSIT_MAX_TILES * MUSTER_TRANSIT_MS_PER_TILE + musterSailMs(sail.from, sail.to));
  });

  it("falls back to the straight walk when there is no dock route", () => {
    const route = planMusterTransitRoute({ from: { x: 12, y: 15 }, to: { x: 12, y: 35 }, isPassable: isLand, crossingsFrom: () => undefined, maxSteps: 60 });
    expect(route.legs).toHaveLength(1);
    expect(route.legs[0]!.kind).toBe("WALK");
  });

  it("walks round a short obstacle rather than taking a slower voyage", () => {
    // A two-tile wall at x = 5, y 4..6 on open land, with a dock at (3,5)
    // linked to a landing far beyond the target: walking round is quicker.
    const wall = (x: number, y: number): boolean => !(x === 5 && y >= 4 && y <= 6);
    const farDock = (x: number, y: number) => (x === 4 && y === 5 ? [{ x: 7, y: 25 }] : undefined);
    const route = planMusterTransitRoute({ from: { x: 3, y: 5 }, to: { x: 7, y: 5 }, isPassable: wall, crossingsFrom: farDock, maxSteps: 60 });
    expect(route.legs.map((leg) => leg.kind)).toEqual(["WALK"]);
    const walk = route.legs[0]!;
    if (walk.kind !== "WALK") throw new Error("expected a walk");
    for (const point of walk.points) expect(wall(point.x, point.y)).toBe(true);
  });

  it("caps the sailing of a chain of crossings", () => {
    // Three islands in a row, each pair linked by docks 30 tiles apart.
    const land = (x: number): boolean => x < 2 || (x >= 40 && x < 42) || x >= 80;
    const links = new Map<string, TransitPoint[]>([["1,0", [{ x: 40, y: 0 }]], ["41,0", [{ x: 80, y: 0 }]]]);
    const route = planMusterTransitRoute({
      from: { x: 0, y: 0 }, to: { x: 81, y: 0 }, isPassable: (x) => land(x),
      crossingsFrom: (x, y) => links.get(`${x},${y}`), maxSteps: 60
    });
    expect(route.legs.filter((leg) => leg.kind === "SAIL")).toHaveLength(2);
    const sailed = route.legs.reduce((sum, leg, i) => sum + (leg.kind === "SAIL" ? route.legMs[i]! : 0), 0);
    expect(sailed).toBeLessThanOrEqual(MUSTER_SAIL_MAX_MS + 1);
  });
});

