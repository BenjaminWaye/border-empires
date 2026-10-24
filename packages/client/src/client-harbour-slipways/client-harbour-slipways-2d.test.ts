import { describe, expect, it } from "vitest";
import type { DockPair, Tile } from "../client-types.js";
import { drawSlipways2D } from "./client-harbour-slipways-2d.js";

// Dock (5,5) on an east coast (sea from x=6); beaches (5,4) and (5,6).
const tiles = new Map<string, Tile>();
for (let y = 2; y <= 8; y += 1) for (let x = 2; x <= 8; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: x <= 5 ? "LAND" : "SEA" });
const dockPairs: DockPair[] = [{ ax: 5, ay: 5, bx: 40, by: 40 }];

const recordingCtx = () => {
  const fills: string[] = [];
  const paths: Array<Array<[number, number]>> = [];
  const point = (x: number, y: number) => paths[paths.length - 1]!.push([x, y]);
  const ctx = {
    save: () => {}, restore: () => {}, closePath: () => {}, stroke: () => {},
    beginPath: () => { paths.push([]); },
    moveTo: point,
    lineTo: point,
    fill() { fills.push(this.fillStyle); },
    fillStyle: "", strokeStyle: "", lineWidth: 1
  };
  return { ctx, fills, paths };
};

const deps = (tileVisible: (x: number, y: number) => boolean) => ({
  tileCenter: (x: number, y: number) => ({ sx: x * 10, sy: y * 10 }),
  size: 10,
  viewportWidth: 1_000,
  viewportHeight: 1_000,
  tileVisible
});

describe("drawSlipways2D", () => {
  it("draws a ramp, a hull and a cabin on each visible beach beside a dock", () => {
    const { ctx, fills } = recordingCtx();
    drawSlipways2D(ctx as unknown as CanvasRenderingContext2D, { dockPairs, tiles }, deps(() => true));
    // Two beaches x (ramp, hull, cabin).
    expect(fills).toEqual(["#7c5a39", "#5a2f26", "#b9a98a", "#7c5a39", "#5a2f26", "#b9a98a"]);
  });

  it("runs the ramp out to sea, east of the beach", () => {
    const { ctx, paths } = recordingCtx();
    drawSlipways2D(ctx as unknown as CanvasRenderingContext2D, { dockPairs, tiles }, deps((x, y) => x === 5 && y === 4));
    // The ramp is the first path: it starts just landward of the tile centre (50, 40) and reaches out over the water (x > 55).
    const rampXs = paths[0]!.map(([x]) => x);
    expect(Math.min(...rampXs)).toBeLessThan(50);
    expect(Math.max(...rampXs)).toBeGreaterThan(55);
  });

  it("skips beaches out of sight", () => {
    const { ctx, fills } = recordingCtx();
    drawSlipways2D(ctx as unknown as CanvasRenderingContext2D, { dockPairs, tiles }, deps(() => false));
    expect(fills).toEqual([]);
  });
});
