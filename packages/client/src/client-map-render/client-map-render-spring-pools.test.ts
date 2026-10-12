import { describe, expect, it } from "vitest";
import { WORLD_WIDTH, type RiverHead } from "@border-empires/shared";
import { drawSpringPools } from "./client-map-render-river-edges.js";

type ArcCall = { x: number; y: number; r: number; fill: string };

const recordingContext = (): { ctx: CanvasRenderingContext2D; arcs: ArcCall[] } => {
  const arcs: ArcCall[] = [];
  let fill = "";
  const ctx = {
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    rect: () => {},
    clip: () => {},
    fill: () => {},
    arc: (x: number, y: number, r: number) => arcs.push({ x, y, r, fill }),
    set fillStyle(v: string) {
      fill = v;
    }
  } as unknown as CanvasRenderingContext2D;
  return { ctx, arcs };
};

// A river head on corner (10, 7).
const heads = new Map<number, RiverHead>([[7 * WORLD_WIDTH + 10, { corner: { x: 10, y: 7 }, heading: { dx: 0, dy: 1 }, mountain: null }]]);
const TILE = 40;

describe("2D spring pools", () => {
  it("each of the four tiles round a river head draws the pool centred on that shared corner", () => {
    const centres: Array<[number, number]> = [];
    for (const [wx, wy] of [[9, 6], [10, 6], [9, 7], [10, 7]] as const) {
      const { ctx, arcs } = recordingContext();
      const px = wx * TILE;
      const py = wy * TILE;
      drawSpringPools(ctx, wx, wy, px, py, TILE, TILE, "bank-and-water", heads);
      expect(arcs).toHaveLength(2); // bank, then water
      for (const arc of arcs) centres.push([arc.x, arc.y]);
      expect(arcs[0]!.r).toBeGreaterThan(arcs[1]!.r);
    }
    for (const c of centres) expect(c).toEqual([10 * TILE, 7 * TILE]);
  });

  it("tiles not touching the head corner draw nothing, and the water-only pass skips the bank", () => {
    const far = recordingContext();
    drawSpringPools(far.ctx, 12, 7, 0, 0, TILE, TILE, "bank-and-water", heads);
    expect(far.arcs).toHaveLength(0);
    const waterOnly = recordingContext();
    drawSpringPools(waterOnly.ctx, 10, 7, 0, 0, TILE, TILE, "water", heads);
    expect(waterOnly.arcs).toHaveLength(1);
  });
});
