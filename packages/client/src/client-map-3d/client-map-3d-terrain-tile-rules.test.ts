import { describe, expect, it } from "vitest";
import type { TileVisibilityState } from "../client-types.js";
import { isShallowSeaTile, withUnexploredCoastRingAsFogged } from "./client-map-3d-terrain-tile-rules.js";

const wrap = (v: number): number => ((v % 100) + 100) % 100;

describe("withUnexploredCoastRingAsFogged", () => {
  // Explored: only (10, 10).
  const raw = (wx: number, wy: number): TileVisibilityState => (wx === 10 && wy === 10 ? "visible" : "unexplored");
  const vis = withUnexploredCoastRingAsFogged(raw, wrap, wrap);

  it("reports the first ring of fog (diagonals included) as fogged so its ground draws", () => {
    expect(vis(11, 10)).toBe("fogged");
    expect(vis(9, 9)).toBe("fogged");
  });

  it("leaves explored tiles and deep fog alone", () => {
    expect(vis(10, 10)).toBe("visible");
    expect(vis(12, 10)).toBe("unexplored");
  });
});

describe("isShallowSeaTile", () => {
  it("is shallow with land within 2 tiles, deep otherwise", () => {
    const landAt = (wx: number): "LAND" | "SEA" => (wx === 12 ? "LAND" : "SEA");
    expect(isShallowSeaTile(10, 10, landAt, wrap, wrap)).toBe(true);
    expect(isShallowSeaTile(5, 10, landAt, wrap, wrap)).toBe(false);
  });
});
