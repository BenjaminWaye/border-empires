// v10 rivers start at headwater corners (a mountain in the ring of tiles
// just outside the start corner) so the client can draw them falling out of
// that mountain (docs/river-mountains-plan.md, PR D). v9 paths feed town
// placement in running seasons and must not change.
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../config.js";
import { isHillsTileAt } from "../hills-terrain/hills-terrain.js";
import { setWorldSeed, terrainAt } from "./worldgen.js";
import { riverHeadsForCurrentSeed } from "./worldgen-river-heads.js";
import { generateRiverPaths, type RiverPath } from "./worldgen-rivers.js";

const fingerprint = (paths: readonly RiverPath[]): string =>
  createHash("sha256")
    .update(JSON.stringify(paths.map((path) => path.map((q) => [q.wx.toFixed(4), q.wy.toFixed(4), q.halfWidth.toFixed(4)]))))
    .digest("hex")
    .slice(0, 16);

describe("headwater river starts (worldgen v10)", () => {
  it("leaves v9 river paths unchanged", () => {
    setWorldSeed(555, "continents", 9);
    expect(fingerprint(generateRiverPaths(555))).toBe("5466aca5ded062e2");
    setWorldSeed(4242, "islands", 9);
    expect(fingerprint(generateRiverPaths(4242))).toBe("26cb5dd65eb94246");
  });

  for (const [seed, style] of [[555, "continents"], [42, "continents"], [4242, "islands"]] as const) {
    it(`starts nearly every river beside a mountain, on a clear corner, without losing rivers (${style} ${seed})`, () => {
      setWorldSeed(seed, style, 10);
      const rivers = generateRiverPaths(seed);
      expect(rivers.length).toBe(10);
      const heads = [...riverHeadsForCurrentSeed().values()];
      expect(heads.filter((h) => h.mountain).length).toBeGreaterThanOrEqual(8);
      for (const head of heads) {
        // Still a clear corner: no mountain or hills tile touches it (the
        // client carves every tile round a river corner).
        for (const [dx, dy] of [[-1, -1], [0, -1], [-1, 0], [0, 0]] as const) {
          const tx = (head.corner.x + dx + WORLD_WIDTH) % WORLD_WIDTH;
          const ty = (head.corner.y + dy + WORLD_HEIGHT) % WORLD_HEIGHT;
          expect(terrainAt(tx, ty)).not.toBe("MOUNTAIN");
          if (terrainAt(tx, ty) === "LAND") expect(isHillsTileAt(tx, ty)).toBe(false);
        }
      }
    });
  }
});
