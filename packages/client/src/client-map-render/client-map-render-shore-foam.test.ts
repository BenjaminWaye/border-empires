import { describe, expect, it } from "vitest";
import { drawShoreFoam2D } from "./client-map-render-shore-foam.js";

type Op = { kind: "rect" | "arc"; x: number; y: number; w?: number; h?: number };
const recordingCtx = (): { ctx: CanvasRenderingContext2D; ops: Op[] } => {
  const ops: Op[] = [];
  const ctx = {
    fillStyle: "",
    fillRect: (x: number, y: number, w: number, h: number): void => void ops.push({ kind: "rect", x, y, w, h }),
    beginPath: (): void => undefined,
    arc: (x: number, y: number): void => void ops.push({ kind: "arc", x, y }),
    fill: (): void => undefined
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
};

describe("2D shore foam (parity with the 3D coastline polish)", () => {
  it("bands only the sea tile's edges that border land", () => {
    const { ctx, ops } = recordingCtx();
    // Sea tile (5, 5) at (100, 200), 40px; land only to the west.
    drawShoreFoam2D(ctx, 5, 5, 100, 200, 40, 40, (x, y) => x === 4 && y === 5);
    expect(ops.length).toBe(3); // one west band per foam step
    for (const op of ops) {
      expect(op).toMatchObject({ kind: "rect", x: 100, y: 200, h: 40 });
      expect(op.w!).toBeLessThan(20);
    }
  });

  it("rounds a land corner touching only diagonally, and draws nothing on open sea", () => {
    const corner = recordingCtx();
    drawShoreFoam2D(corner.ctx, 5, 5, 100, 200, 40, 40, (x, y) => x === 6 && y === 4); // land NE, diagonal only
    expect(corner.ops.every((op) => op.kind === "arc" && op.x === 140 && op.y === 200)).toBe(true);
    expect(corner.ops.length).toBe(3);
    const open = recordingCtx();
    drawShoreFoam2D(open.ctx, 5, 5, 100, 200, 40, 40, () => false);
    expect(open.ops).toHaveLength(0);
  });
});
