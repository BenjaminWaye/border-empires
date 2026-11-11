import { describe, expect, it, vi } from "vitest";
import { createRoadNetworkCache } from "./client-road-network-cache.js";
import { createCanvasRoadNetwork } from "./client-canvas-road-network.js";
import type { Tile } from "../client-types.js";

const fixture = () => {
  const tiles = new Map<string, Tile>();
  for (let x = 0; x < 20000; x++) tiles.set(`${x},0`, { x, y: 0, terrain: "LAND" });
  const scans = vi.spyOn(tiles, "values");
  return { deps: { tiles, keyFor: (x: number, y: number) => `${x},${y}`, wrapX: (x: number) => x, wrapY: (y: number) => y }, scans };
};

describe("revealed-map road work", () => {
  it("scans known tiles once across repeated camera rebuilds at the same tile revision", () => {
    const { deps, scans } = fixture();
    const roads = createRoadNetworkCache();
    const first = roads(deps, 1);
    for (let frame = 0; frame < 50; frame++) expect(roads(deps, 1)).toBe(first);
    expect(scans).toHaveBeenCalledTimes(1);
    expect(roads(deps, 2)).not.toBe(first);
    expect(scans).toHaveBeenCalledTimes(2);
    expect(roads({ ...deps, tiles: new Map(deps.tiles) }, 2)).not.toBe(first);
  });

  it("refreshes roads after an in-place territory update", () => {
    const { deps } = fixture();
    const roads = createRoadNetworkCache();
    const previous = roads(deps, 1);
    deps.tiles.get("0,0")!.ownerId = "elin";
    expect(roads(deps, 2)).not.toBe(previous);
  });

  it("does no canvas world scans while the 3D renderer is active", () => {
    const { deps, scans } = fixture();
    const canvas = createCanvasRoadNetwork(deps);
    for (let now = 1000; now < 10000; now += 500) canvas(now, 32, true, now);
    expect(scans).not.toHaveBeenCalled();
    const first = canvas(10000, 32, false, 1).roads;
    expect(scans).toHaveBeenCalledTimes(1);
    expect(canvas(11000, 32, false, 1).roads).toBe(first);
    expect(scans).toHaveBeenCalledTimes(1);
    canvas(12000, 32, false, 2);
    expect(scans).toHaveBeenCalledTimes(2);
  });
});
