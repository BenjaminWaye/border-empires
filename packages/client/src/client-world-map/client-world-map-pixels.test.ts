import { describe, expect, it } from "vitest";
import { buildWorldMapPixels, parseHexRgb, WORLD_MAP_FOG_RGB, type WorldMapTile } from "./client-world-map-pixels.js";

const W = 8;
const H = 4;
const px = (data: Uint8ClampedArray, x: number, y: number): number[] => Array.from(data.slice((y * W + x) * 4, (y * W + x) * 4 + 4));
const build = (tiles: WorldMapTile[], me = "me", ownColor = "#ff0000"): Uint8ClampedArray =>
  buildWorldMapPixels({ tiles, meId: me, ownColor, width: W, height: H });

describe("world map pixels", () => {
  it("leaves every tile the client does not hold as fog, so unexplored terrain never shows", () => {
    const data = build([{ x: 1, y: 1, terrain: "LAND" }]);
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < W; x += 1) {
        if (x === 1 && y === 1) continue;
        expect(px(data, x, y)).toEqual([...WORLD_MAP_FOG_RGB, 255]);
      }
    }
    expect(px(data, 1, 1)).not.toEqual([...WORLD_MAP_FOG_RGB, 255]);
  });

  it("draws known land and sea, dims remembered (fogged) tiles and keeps them visible", () => {
    const data = build([
      { x: 0, y: 0, terrain: "LAND" },
      { x: 1, y: 0, terrain: "LAND", fogged: true },
      { x: 2, y: 0, terrain: "SEA" }
    ]);
    const visible = px(data, 0, 0);
    const remembered = px(data, 1, 0);
    expect(remembered[1]).toBeLessThan(visible[1]!);
    expect(remembered).not.toEqual([...WORLD_MAP_FOG_RGB, 255]);
    expect(px(data, 2, 0)[2]).toBeGreaterThan(px(data, 2, 0)[0]!);
  });

  it("marks the player's own land in their colour, but not other Houses' land", () => {
    const data = build([
      { x: 0, y: 0, terrain: "LAND", ownerId: "me" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "rival" },
      { x: 2, y: 0, terrain: "LAND" }
    ]);
    expect(px(data, 0, 0)[0]).toBeGreaterThan(180);
    expect(px(data, 1, 0)).toEqual(px(data, 2, 0));
  });

  it("wraps out-of-range coordinates and reuses the given buffer", () => {
    const out = new Uint8ClampedArray(W * H * 4);
    const data = buildWorldMapPixels({ tiles: [{ x: -1, y: H, terrain: "MOUNTAIN" }], meId: "", ownColor: "", width: W, height: H, out });
    expect(data).toBe(out);
    expect(px(data, W - 1, 0)).toEqual([139, 141, 146, 255]);
  });

  it("parses owner colours and rejects anything that is not hex", () => {
    expect(parseHexRgb("#0a0B0c")).toEqual([10, 11, 12]);
    expect(parseHexRgb("#fff")).toEqual([255, 255, 255]);
    expect(parseHexRgb("rgb(1,2,3)")).toBeUndefined();
  });
});
