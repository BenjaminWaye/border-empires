import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { setWorldSeed, terrainAt } from "@border-empires/shared";
import { drawSeaCoast2D, drawShoreFoam2D } from "./client-map-render-shore-foam.js";

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

  // Season worldgen carves 1-tile SEA channels on the server only; the seeded
  // terrainAt still says LAND there, so the coast must take the synced-tile
  // lookup the map facade passes in, or it foams a band across the channel.
  it("draws the coast from the caller's land lookup, not the seeded terrain", () => {
    setWorldSeed(1);
    const isSeededLand = (x: number, y: number): boolean => terrainAt(x, y) === "LAND";
    let tile: { x: number; y: number } | undefined;
    for (let y = 40; y < 400 && !tile; y += 1) {
      for (let x = 40; x < 400 && !tile; x += 1) {
        let allLand = true;
        for (let dy = -1; dy <= 1 && allLand; dy += 1) for (let dx = -1; dx <= 1 && allLand; dx += 1) allLand = isSeededLand(x + dx, y + dy);
        if (allLand) tile = { x, y };
      }
    }
    if (!tile) throw new Error("no seeded inland tile found");
    const seeded = recordingCtx();
    drawSeaCoast2D(seeded.ctx, tile.x, tile.y, 100, 200, 40, 40);
    expect(seeded.ops.length).toBeGreaterThan(0); // seeded neighbours read as land
    const carved = recordingCtx();
    drawSeaCoast2D(carved.ctx, tile.x, tile.y, 100, 200, 40, 40, () => false); // synced tiles: all sea
    expect(carved.ops).toHaveLength(0);
  });

  it("is wired to the synced-tile terrain in the 2D map facade", () => {
    const facade = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../client-map-facade.ts"), "utf8");
    expect(facade).toContain("const knownTerrain = knownTerrainAt(state, keyFor, wrapX, wrapY, terrainAt);");
    expect(facade).toContain("isLandAt: knownLandAt,");
  });
});
