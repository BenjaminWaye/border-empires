import { describe, expect, it } from "vitest";
import { WORLD_WIDTH } from "@border-empires/shared";
import { findStrandedFrontier, type StrandedFrontierTileView } from "./stranded-frontier-finder.js";

const tileMap = (tiles: StrandedFrontierTileView[]): Map<string, StrandedFrontierTileView> =>
  new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));

const frontier = (x: number, y: number, ownerId = "p1", extra: Partial<StrandedFrontierTileView> = {}): StrandedFrontierTileView => ({
  x, y, ownerId, ownershipState: "FRONTIER", ...extra
});
const settled = (x: number, y: number, ownerId = "p1"): StrandedFrontierTileView => ({ x, y, ownerId, ownershipState: "SETTLED" });

const run = (tiles: Map<string, StrandedFrontierTileView>, seeds: string[], maxVisited = 1_000, extra?: (key: string) => string[]) =>
  findStrandedFrontier({
    seedKeys: seeds,
    ownerId: "p1",
    getTile: (key) => tiles.get(key),
    ...(extra ? { extraNeighborKeys: extra } : {}),
    maxVisited
  });

describe("findStrandedFrontier", () => {
  it("treats a frontier tile next to an owned settled tile as connected", () => {
    const tiles = tileMap([settled(5, 5), frontier(6, 5)]);
    expect(run(tiles, ["6,5"])).toEqual({ stranded: [], visited: 1, capped: false });
  });

  it("follows a frontier chain to a settled tile (diagonals count)", () => {
    const tiles = tileMap([settled(0, 0), frontier(1, 1), frontier(2, 2), frontier(3, 3)]);
    expect(run(tiles, ["3,3"]).stranded).toEqual([]);
  });

  it("returns the whole component when no member reaches a terminal", () => {
    const tiles = tileMap([settled(0, 0), frontier(5, 5), frontier(6, 5), frontier(7, 6)]);
    expect(run(tiles, ["5,5"]).stranded.sort()).toEqual(["5,5", "6,5", "7,6"]);
  });

  it("does not path through another owner's tiles", () => {
    const tiles = tileMap([settled(0, 0), frontier(1, 0, "p2"), frontier(2, 0)]);
    expect(run(tiles, ["2,0"]).stranded).toEqual(["2,0"]);
  });

  it("counts a frontier dock tile as a terminal, in the component or as a neighbour", () => {
    expect(run(tileMap([frontier(5, 5, "p1", { dockId: "d1" }), frontier(6, 5)]), ["6,5"]).stranded).toEqual([]);
    expect(run(tileMap([frontier(5, 5, "p1", { dockId: "d1" })]), ["5,5"]).stranded).toEqual([]);
  });

  it("follows extra links such as aether bridges", () => {
    const tiles = tileMap([settled(0, 0), frontier(1, 0), frontier(40, 40)]);
    const bridge = (key: string): string[] => (key === "40,40" ? ["1,0"] : key === "1,0" ? ["40,40"] : []);
    expect(run(tiles, ["40,40"], 1_000, bridge).stranded).toEqual([]);
    expect(run(tiles, ["40,40"]).stranded).toEqual(["40,40"]);
  });

  it("classifies each component once even with many seeds in it", () => {
    const tiles = tileMap([frontier(5, 5), frontier(6, 5), frontier(7, 5)]);
    const result = run(tiles, ["5,5", "6,5", "7,5"]);
    expect(result.stranded.sort()).toEqual(["5,5", "6,5", "7,5"]);
    expect(result.visited).toBe(3);
  });

  it("ignores seeds that are not the owner's frontier tiles", () => {
    const tiles = tileMap([settled(5, 5), frontier(6, 5, "p2")]);
    expect(run(tiles, ["5,5", "6,5", "9,9"])).toEqual({ stranded: [], visited: 0, capped: false });
  });

  it("fails open when the cap is hit: the capped component is never reported", () => {
    const tiles = tileMap(Array.from({ length: 50 }, (_, i) => frontier(i, 10)));
    const result = run(tiles, ["0,10"], 10);
    expect(result.capped).toBe(true);
    expect(result.stranded).toEqual([]);
  });

  it("wraps across the world edge like encirclement does", () => {
    const edgeX = WORLD_WIDTH - 1;
    const tiles = tileMap([settled(0, 7), frontier(edgeX, 7)]);
    expect(run(tiles, [`${edgeX},7`]).stranded).toEqual([]);
    // Same tile with nothing across the edge is stranded, so the wrap is what connects it.
    expect(run(tileMap([frontier(edgeX, 7)]), [`${edgeX},7`]).stranded).toEqual([`${edgeX},7`]);
  });
});
