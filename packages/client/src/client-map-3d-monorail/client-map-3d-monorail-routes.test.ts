import { describe, expect, it } from "vitest";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import { STATION_RADIUS, trimArmToStation } from "./client-map-3d-monorail-guideway.js";
import { traceMonorailLines, type RouteTraceInput } from "./client-map-3d-monorail-routes.js";

const W = 200;
const wrap = (n: number): number => ((n % W) + W) % W;
const delta = (from: number, to: number): number => {
  let d = wrap(to) - wrap(from);
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
};

// Town at x=10 and x=20 on row 50, a junction at x=15 with a spur south to a
// third town at (15, 54).
const roads = new Map<string, RoadDirections>();
const set = (x: number, y: number, dirs: RoadDirections): void => { roads.set(`${x},${y}`, dirs); };
set(10, 50, { east: true, terminal: true });
for (let x = 11; x < 20; x += 1) set(x, 50, { east: true, west: true });
set(15, 50, { east: true, west: true, south: true });
for (let y = 51; y < 54; y += 1) set(15, y, { north: true, south: true });
set(15, 54, { north: true, terminal: true });
set(20, 50, { west: true, terminal: true });

const input = (camX: number, camY: number, halfW = 30): RouteTraceInput => ({
  window: { camX, camY, halfW, halfH: 30 },
  sceneXOf: (wx) => delta(camX, wx) + 0.5,
  sceneZOf: (wy) => delta(camY, wy) + 0.5,
  roadDirsAt: (wx, wy) => roads.get(`${wx},${wy}`),
  wrapX: wrap,
  wrapY: wrap,
  elevationAt: () => 0,
  railHeight: 0.3
});
const visible = [...roads].map(([key, dirs]) => {
  const [wx, wy] = key.split(",").map(Number) as [number, number];
  return { wx, wy, dirs };
});

describe("monorail line tracing", () => {
  it("splits the network into one line per stop-to-stop stretch", () => {
    const lines = traceMonorailLines(input(15, 50), visible);
    expect(lines).toHaveLength(3); // west town -> junction, junction -> east town, junction -> south town
    for (const line of lines) expect(line.length).toBeGreaterThan(2);
  });

  it("keeps each line's identity, length and world placement when the camera pans", () => {
    // A pan rebuilds the window; trains are placed by (time, line), so the line
    // must not change shape or length, only shift in scene space by the pan.
    const before = traceMonorailLines(input(15, 50), visible);
    const after = traceMonorailLines(input(18, 47), visible);
    const byId = new Map(after.map((line) => [line.id, line]));
    for (const line of before) {
      const moved = byId.get(line.id);
      expect(moved).toBeDefined();
      expect(moved!.length).toBeCloseTo(line.length, 4);
      expect(moved!.xs[0]! - line.xs[0]!).toBeCloseTo(-3, 4);
      expect(moved!.zs[0]! - line.zs[0]!).toBeCloseTo(3, 4);
    }
  });

  it("traces a line to its real ends even when only its middle is on screen", () => {
    // Window shows only x 13..17 of the west line; it must still run from the
    // west town to the junction, not stop at the window edge.
    const narrow = traceMonorailLines(input(15, 50, 2), visible.filter((t) => t.wx === 13 && t.wy === 50));
    expect(narrow).toHaveLength(1);
    const full = traceMonorailLines(input(15, 50), visible).find((line) => line.id === narrow[0]!.id)!;
    expect(narrow[0]!.length).toBeCloseTo(full.length, 4);
  });

  it("starts town lines at the station gate on the town's edge", () => {
    const arm: Array<[number, number]> = [[0.06, 0], [0.2, 0], [0.35, 0], [0.5, 0]];
    const trimmed = trimArmToStation(arm, 0, 0);
    expect(trimmed[0]![0]).toBeCloseTo(STATION_RADIUS, 6);
    expect(trimmed[trimmed.length - 1]).toEqual([0.5, 0]);
  });
});
