import { describe, expect, it } from "vitest";
import type { TileVisibilityState } from "../client-types.js";
import { hasLiveNeighbour, isShallowSeaTile, withUnexploredCoastRingAsFogged } from "./client-map-3d-terrain-tile-rules.js";

const wrap = (v: number): number => ((v % 100) + 100) % 100;

describe("withUnexploredCoastRingAsFogged", () => {
  // Explored: only (10, 10).
  const raw = (wx: number, wy: number): TileVisibilityState => (wx === 10 && wy === 10 ? "visible" : "unexplored");
  const vis = withUnexploredCoastRingAsFogged(raw, wrap, wrap);

  it("looks each tile up once per rebuild, however often the rebuild asks", () => {
    let calls = 0;
    const counted = withUnexploredCoastRingAsFogged((wx, wy) => (calls += 1, raw(wx, wy)), wrap, wrap);
    for (let pass = 0; pass < 3; pass += 1) for (let x = 5; x < 15; x += 1) for (let y = 5; y < 15; y += 1) counted(x, y);
    // 10x10 queried tiles plus their one-tile border: 12 x 12 raw lookups, ever.
    expect(calls).toBe(144);
    expect(counted(11, 11)).toBe("fogged");
    expect(counted(13, 13)).toBe("unexplored");
  });

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

describe("hasLiveNeighbour", () => {
  it("is true only when one of the 8 neighbours is in sight", () => {
    const at = (vis: TileVisibilityState) => (wx: number, wy: number): TileVisibilityState => (wx === 11 && wy === 11 ? vis : "unexplored");
    expect(hasLiveNeighbour(at("visible"), 10, 10, wrap, wrap)).toBe(true);
    expect(hasLiveNeighbour(at("fogged"), 10, 10, wrap, wrap)).toBe(false);
    expect(hasLiveNeighbour(at("visible"), 11, 11, wrap, wrap)).toBe(false); // itself doesn't count
  });
});
