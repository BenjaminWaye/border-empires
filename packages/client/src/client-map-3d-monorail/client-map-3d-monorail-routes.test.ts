import { describe, expect, it } from "vitest";
import type { RoadDirections } from "../client-road-network/client-road-network.js";
import { STATION_RADIUS, trimArmToStation } from "./client-map-3d-monorail-guideway.js";
import { traceMonorailLines, type MonorailLine, type RouteTraceInput } from "./client-map-3d-monorail-routes.js";

const W = 200;
const wrap = (n: number): number => ((n % W) + W) % W;
const delta = (from: number, to: number): number => {
  let d = wrap(to) - wrap(from);
  if (d > W / 2) d -= W;
  if (d < -W / 2) d += W;
  return d;
};

type Roads = Map<string, RoadDirections>;
const set = (roads: Roads, x: number, y: number, dirs: RoadDirections): void => { roads.set(`${wrap(x)},${wrap(y)}`, dirs); };

// Town at x=10 and x=20 on row 50, a junction at x=15 with a spur south to a
// third town at (15, 54).
const roads: Roads = new Map();
set(roads, 10, 50, { east: true, terminal: true });
for (let x = 11; x < 20; x += 1) set(roads, x, 50, { east: true, west: true });
set(roads, 15, 50, { east: true, west: true, south: true });
for (let y = 51; y < 54; y += 1) set(roads, 15, y, { north: true, south: true });
set(roads, 15, 54, { north: true, terminal: true });
set(roads, 20, 50, { west: true, terminal: true });

const tilesOf = (map: Roads): Array<{ wx: number; wy: number; dirs: RoadDirections }> =>
  [...map].map(([key, dirs]) => {
    const [wx, wy] = key.split(",").map(Number) as [number, number];
    return { wx, wy, dirs };
  });

// `drawn` = the tiles the guideway actually drew this rebuild (the window minus
// fogged/unexplored tiles); the tracer is handed exactly those.
const trace = (camX: number, camY: number, drawn: ReadonlyArray<{ wx: number; wy: number; dirs: RoadDirections }>, map: Roads = roads): MonorailLine[] => {
  const drawnKeys = new Set(drawn.map((t) => `${t.wx},${t.wy}`));
  const input: RouteTraceInput = {
    isDrawnTile: (wx, wy) => drawnKeys.has(`${wx},${wy}`),
    sceneXOf: (wx) => delta(camX, wx) + 0.5,
    sceneZOf: (wy) => delta(camY, wy) + 0.5,
    roadDirsAt: (wx, wy) => map.get(`${wx},${wy}`),
    wrapX: wrap,
    wrapY: wrap,
    elevationAt: () => 0,
    railHeight: 0.3
  };
  return traceMonorailLines(input, drawn);
};
const all = tilesOf(roads);

describe("monorail line tracing", () => {
  it("splits the network into one line per stop-to-stop stretch", () => {
    const lines = trace(15, 50, all);
    expect(lines).toHaveLength(3); // west town -> junction, junction -> east town, junction -> south town
    for (const line of lines) expect(line.length).toBeGreaterThan(2);
  });

  it("keeps each line's identity, length and world placement when the camera pans", () => {
    // A pan rebuilds the window; trains are placed by (time, line), so the line
    // must not change shape or length, only shift in scene space by the pan.
    const before = trace(15, 50, all);
    const after = trace(18, 47, all);
    const byId = new Map(after.map((line) => [line.id, line]));
    for (const line of before) {
      const moved = byId.get(line.id);
      expect(moved).toBeDefined();
      expect(moved!.length).toBeCloseTo(line.length, 4);
      expect(moved!.xs[0]! - line.xs[0]!).toBeCloseTo(-3, 4);
      expect(moved!.zs[0]! - line.zs[0]!).toBeCloseTo(3, 4);
    }
  });

  it("keeps a line's direction when a pan changes which of its stops is seen first", () => {
    // Regression: the west line used to run from whichever stop the scan met
    // first -- the town while it was on screen, the junction once only the
    // track was -- so every train on it jumped to the mirrored position.
    const withTown = trace(15, 50, all).find((l) => l.id.includes("10,50"))!;
    const trackOnly = trace(15, 50, all.filter((t) => t.wy === 50 && t.wx >= 12 && t.wx <= 14))
      .find((l) => l.id === withTown.id)!;
    expect(trackOnly).toBeDefined();
    expect(trackOnly.xs[0]).toBeCloseTo(withTown.xs[0]!, 4);
    expect(trackOnly.zs[0]).toBeCloseTo(withTown.zs[0]!, 4);
    expect(trackOnly.xs[trackOnly.xs.length - 1]).toBeCloseTo(withTown.xs[withTown.xs.length - 1]!, 4);
  });

  it("traces a line to its real ends even when only its middle is drawn", () => {
    const narrow = trace(15, 50, all.filter((t) => t.wx === 13 && t.wy === 50));
    expect(narrow).toHaveLength(1);
    const full = trace(15, 50, all).find((line) => line.id === narrow[0]!.id)!;
    expect(narrow[0]!.length).toBeCloseTo(full.length, 4);
  });

  it("hides trains on stretches whose guideway wasn't drawn (fogged or off-screen)", () => {
    // Regression: visibility used to be the window rectangle, so trains kept
    // running into fogged land where no rail is drawn.
    const drawn = all.filter((t) => t.wy === 50 && t.wx <= 13);
    const line = trace(15, 50, drawn).find((l) => l.id.includes("10,50"))!;
    for (let i = 0; i < line.xs.length; i += 1) {
      const tileX = Math.floor(line.xs[i]! - 0.5 + 15 + 0.5 - 1e-6);
      if (tileX >= 15) expect(line.visible[i]).toBe(0);
    }
    expect(line.visibleTo).toBeLessThan(line.length);
    expect(line.visibleFrom).toBe(0);
  });

  it("traces a line across the world's wrap seam without a jump", () => {
    const seam: Roads = new Map();
    set(seam, W - 3, 10, { east: true, terminal: true });
    for (let x = W - 2; x < W + 2; x += 1) set(seam, x, 10, { east: true, west: true });
    set(seam, 2, 10, { west: true, terminal: true });
    const lines = trace(0, 10, tilesOf(seam), seam);
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    // Five tiles apart, minus the two station trims.
    expect(line.length).toBeCloseTo(5 - 2 * STATION_RADIUS, 2);
    for (let i = 1; i < line.xs.length; i += 1) expect(Math.abs(line.xs[i]! - line.xs[i - 1]!)).toBeLessThan(0.2);
  });

  it("starts town lines at the station gate on the town's edge", () => {
    const arm: Array<[number, number]> = [[0.06, 0], [0.2, 0], [0.35, 0], [0.5, 0]];
    const trimmed = trimArmToStation(arm, 0, 0);
    expect(trimmed[0]![0]).toBeCloseTo(STATION_RADIUS, 6);
    expect(trimmed[trimmed.length - 1]).toEqual([0.5, 0]);
  });
});
