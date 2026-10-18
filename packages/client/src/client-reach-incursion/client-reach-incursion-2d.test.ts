import { afterEach, describe, expect, it, vi } from "vitest";
import { drawReachTileTreatments2D } from "./client-reach-incursion-2d.js";
import type { Tile } from "../client-types.js";

const keyFor = (x: number, y: number): string => `${x},${y}`;

// Records which images were stamped and at what alpha; the pre-rendered tiles
// themselves are fake canvases (vitest runs without a DOM).
const fakeCtx = () => {
  const stamps: Array<{ alpha: number; image: unknown }> = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: "",
    save: () => undefined,
    restore: () => undefined,
    fillRect: () => undefined,
    drawImage: (image: unknown) => void stamps.push({ alpha: ctx.globalAlpha, image })
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, stamps };
};

const fakeCanvas = () => ({
  width: 0,
  height: 0,
  getContext: () => ({ fillStyle: "", fillRect: () => undefined, beginPath: () => undefined, moveTo: () => undefined, lineTo: () => undefined, closePath: () => undefined, fill: () => undefined })
});

const draw = (tile: Tile, myReach: ReadonlySet<string> = new Set()) => {
  vi.stubGlobal("document", { createElement: fakeCanvas });
  const { ctx, stamps } = fakeCtx();
  const tiles = new Map<string, Tile>([[keyFor(tile.x, tile.y), tile]]);
  drawReachTileTreatments2D(ctx, tile, tile.x, tile.y, 0, 0, 32, myReach, {
    tiles,
    keyFor,
    wrapX: (x) => x,
    wrapY: (y) => y,
    me: "me",
    ownerColor: (ownerId) => (ownerId === "rival" ? "#ff0000" : "#0000ff")
  });
  return stamps;
};

afterEach(() => vi.unstubAllGlobals());

describe("drawReachTileTreatments2D rival reach over my tiles", () => {
  it("stamps the rival-reach lines on my own tile inside a rival's reach", () => {
    const stamps = draw({ x: 3, y: 3, terrain: "LAND", ownerId: "me", reachOwnerId: "rival" } as Tile);
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.alpha).toBe(0.85);
  });

  it("draws nothing on my tile inside my own reach", () => {
    expect(draw({ x: 3, y: 3, terrain: "LAND", ownerId: "me", reachOwnerId: "me" } as Tile)).toHaveLength(0);
  });

  it("still uses the incursion hatch, not the rival-reach lines, for a rival tile inside my reach", () => {
    const stamps = draw({ x: 3, y: 3, terrain: "LAND", ownerId: "rival", reachOwnerId: "me" } as Tile, new Set([keyFor(3, 3)]));
    expect(stamps).toHaveLength(1);
    expect(stamps[0]!.alpha).toBe(0.6);
  });
});
