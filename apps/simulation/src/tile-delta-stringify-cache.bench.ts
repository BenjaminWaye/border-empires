/**
 * Bench: TileDeltaStringifyCache warm vs cold paths.
 *
 * The cache's value is skipping JSON.stringify on stable substructure refs.
 * "Cold" = first call per entry (computes stringify). "Warm" = subsequent call
 * with same refs (no stringify). Both are measured against a baseline of calling
 * JSON.stringify directly on every tile.
 *
 * NOTE on the warm/cold ordering: vitest bench runs each suite independently.
 * The warm bench pre-populates outside the timed region so only the cache-hit
 * path is measured. Because the timed region still allocates a return object per
 * call, warm throughput is similar to cold for tiles with no substructures
 * (stringify is trivially fast for undefined). The speedup is proportional to
 * the average substructure density of real tiles.
 */
import { bench, describe } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { TileDeltaStringifyCache } from "./tile-delta-stringify-cache.js";

const N = 8_000;

const makeTile = (i: number): DomainTileState => ({
  x: i % 200,
  y: Math.floor(i / 200),
  terrain: "LAND",
  ownerId: `player-${i % 5}`,
  ownershipState: "FRONTIER",
  fort: i % 3 === 0 ? { ownerId: `player-${i % 5}`, status: "active" } : undefined,
  town: i % 7 === 0 ? { populationTier: "TOWN", type: "FARMING" } : undefined,
  observatory: i % 11 === 0 ? { ownerId: `player-${i % 5}`, status: "active" } : undefined
});

// Tiles and keys are stable across bench runs — same object refs every iteration.
const tiles: DomainTileState[] = Array.from({ length: N }, (_, i) => makeTile(i));
const keys = tiles.map((t) => `${t.x},${t.y}`);

// A single pre-warmed cache shared across warm-bench iterations so the warm
// path isn't measuring Map population.
const prewarmedCache = new TileDeltaStringifyCache();
for (let i = 0; i < N; i++) {
  prewarmedCache.getOrComputeAll(keys[i]!, tiles[i]!);
}

describe("TileDeltaStringifyCache", () => {
  bench("baseline: inline JSON.stringify per substructure (no cache)", () => {
    for (let i = 0; i < N; i++) {
      const t = tiles[i]!;
      void (t.town ? JSON.stringify(t.town) : undefined);
      void (t.fort ? JSON.stringify(t.fort) : undefined);
      void (t.observatory ? JSON.stringify(t.observatory) : undefined);
      void (t.siegeOutpost ? JSON.stringify(t.siegeOutpost) : undefined);
      void (t.economicStructure ? JSON.stringify(t.economicStructure) : undefined);
      void (t.sabotage ? JSON.stringify(t.sabotage) : undefined);
      void (t.shardSite ? JSON.stringify(t.shardSite) : undefined);
    }
  });

  bench("cold (fresh cache each iteration)", () => {
    const cache = new TileDeltaStringifyCache();
    for (let i = 0; i < N; i++) {
      cache.getOrComputeAll(keys[i]!, tiles[i]!);
    }
  });

  bench("warm (pre-populated cache, same refs — pure cache-hit path)", () => {
    // Pre-warmed cache is reused; no Map insertion or stringify happens here.
    // This measures the overhead of the hit path: Map.get + 7 ref-checks + object alloc.
    for (let i = 0; i < N; i++) {
      prewarmedCache.getOrComputeAll(keys[i]!, tiles[i]!);
    }
  });
});
