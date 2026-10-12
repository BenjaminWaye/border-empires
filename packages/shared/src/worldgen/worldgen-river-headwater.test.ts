// v11 rivers start at headwater corners (a mountain in the ring of tiles
// just outside the start corner) so the client can draw them falling out of
// that mountain (docs/rivers-remake-plan.md, "River mountains"). v9 and v10 paths feed
// town placement in running seasons (v10 on staging) and must not change.
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

// River fingerprints of develop's v10 worlds before the headwater rule.
const V10_CONTINENTS_555 = "6a09718229874018";
const V10_ISLANDS_4242 = "bfd32e1504eadfc7";

describe("headwater river starts (worldgen v11)", () => {
  it("leaves v9 river paths unchanged", () => {
    setWorldSeed(555, "continents", 9);
    expect(fingerprint(generateRiverPaths(555))).toBe("5466aca5ded062e2");
    setWorldSeed(4242, "islands", 9);
    expect(fingerprint(generateRiverPaths(4242))).toBe("26cb5dd65eb94246");
  });

  it("leaves v10 river paths unchanged (staging seasons run on v10)", () => {
    setWorldSeed(555, "continents", 10);
    expect(fingerprint(generateRiverPaths(555))).toBe(V10_CONTINENTS_555);
    setWorldSeed(4242, "islands", 10);
    expect(fingerprint(generateRiverPaths(4242))).toBe(V10_ISLANDS_4242);
  });

  for (const [seed, style] of [[555, "continents"], [42, "continents"], [4242, "islands"]] as const) {
    it(`starts nearly every river beside a mountain, on a clear corner, without losing rivers (${style} ${seed})`, () => {
      setWorldSeed(seed, style, 11);
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
