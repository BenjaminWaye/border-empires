import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

// Season worldgen carves 1-tile SEA channels (ensureLandMassesReachSea ->
// overrideTerrainAt) on the server only; the client's seeded terrainAt still
// reports those tiles as LAND. The heightfield and water tiles read the
// server tile (terrainForWorldTile), but the water/shore layer's land mask
// read the seeded lookup, so its beach fringe filled the channel and it drew
// as a strip of green diamonds (prod season 13, row 298). Guarded at source
// level because the wiring needs a live WebGL context to run.
const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "client-map-3d.ts"), "utf8");

describe("3D shore reads the server's terrain for carved sea channels", () => {
  it("feeds the water/shore land mask from the tile-first terrain lookup", () => {
    const call = source.slice(source.indexOf("createMapWater(scene,"), source.indexOf("onShoreFringe:"));
    expect(call).toContain("terrainAt: (x, y) => terrainForWorldTile(x, y)");
    expect(call).not.toContain("terrainAt: deps.terrainAt");
  });

  it("feeds the ownership overlay's coast neighbours from the tile-first terrain lookup", () => {
    expect(source).toContain('isLandAt: (x, y) => terrainForWorldTile(x, y) === "LAND"');
    expect(source).not.toContain('isLandAt: (x, y) => deps.terrainAt(x, y) === "LAND"');
  });
});
