import { describe, expect, it } from "vitest";

import type { Dock, TileKey } from "@border-empires/shared";

import { summarizeDockCoverage } from "./server-dock-coverage.js";

describe("server dock coverage", () => {
  const worldWidth = 8;
  const worldHeight = 8;
  const key = (x: number, y: number): TileKey => `${x},${y}`;
  const wrapX = (x: number, width: number) => ((x % width) + width) % width;
  const wrapY = (y: number, height: number) => ((y % height) + height) % height;

  it("treats diagonal land strips as one component and reports undocked samples", () => {
    const diagonalStrip = new Set<TileKey>(["1,1", "2,2", "3,3", "4,4"]);
    const terrainAt = (x: number, y: number): "LAND" | "SEA" => (diagonalStrip.has(key(x, y)) ? "LAND" : "SEA");

    const summary = summarizeDockCoverage({
      worldWidth,
      worldHeight,
      terrainAt,
      wrapX,
      wrapY,
      key,
      docksByTile: new Map<TileKey, Dock>()
    });

    expect(summary.landComponents).toBe(1);
    expect(summary.undockedComponents).toBe(1);
    expect(summary.largestUndockedComponentTiles).toBe(4);
    expect(summary.undockedComponentSamples).toEqual([{ x: 1, y: 1, tileCount: 4 }]);
  });

  it("counts docked and undocked land components separately", () => {
    const dockedIsland = new Set<TileKey>(["1,1", "1,2", "2,1", "2,2"]);
    const undockedIsland = new Set<TileKey>(["5,5", "5,6", "6,5"]);
    const landTiles = new Set<TileKey>([...dockedIsland, ...undockedIsland]);
    const terrainAt = (x: number, y: number): "LAND" | "SEA" => (landTiles.has(key(x, y)) ? "LAND" : "SEA");
    const docksByTile = new Map<TileKey, Dock>([
      [
        "1,1",
        { dockId: "dock-1", tileKey: "1,1", pairedDockId: "dock-2", connectedDockIds: ["dock-2"], cooldownUntil: 0 }
      ]
    ]);

    const summary = summarizeDockCoverage({
      worldWidth,
      worldHeight,
      terrainAt,
      wrapX,
      wrapY,
      key,
      docksByTile
    });

    expect(summary.dockCount).toBe(1);
    expect(summary.landComponents).toBe(2);
    expect(summary.dockedComponents).toBe(1);
    expect(summary.undockedComponents).toBe(1);
    expect(summary.undockedComponentSamples).toEqual([{ x: 5, y: 5, tileCount: 3 }]);
  });

  it("uses the supplied terrain view so runtime overrides can split components", () => {
    const baseLandTiles = new Set<TileKey>(["1,1", "2,1", "3,1", "4,1"]);
    const removedAtRuntime = new Set<TileKey>(["2,1"]);
    const terrainAt = (x: number, y: number): "LAND" | "SEA" => {
      const tile = key(x, y);
      if (!baseLandTiles.has(tile) || removedAtRuntime.has(tile)) return "SEA";
      return "LAND";
    };
    const docksByTile = new Map<TileKey, Dock>([
      [
        "1,1",
        { dockId: "dock-1", tileKey: "1,1", pairedDockId: "dock-2", connectedDockIds: ["dock-2"], cooldownUntil: 0 }
      ]
    ]);

    const summary = summarizeDockCoverage({ worldWidth, worldHeight, terrainAt, wrapX, wrapY, key, docksByTile });

    expect(summary.landComponents).toBe(2);
    expect(summary.dockedComponents).toBe(1);
    expect(summary.undockedComponents).toBe(1);
    expect(summary.largestUndockedComponentTiles).toBe(2);
    expect(summary.undockedComponentSamples).toEqual([{ x: 3, y: 1, tileCount: 2 }]);
  });
});
