/**
 * Bench: TileDeltaStringifyCache warm vs cold paths.
 * Threshold: warm run < 0.2x cold run (per-tile amortised).
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

const tiles: DomainTileState[] = Array.from({ length: N }, (_, i) => makeTile(i));
const keys = tiles.map((t) => `${t.x},${t.y}`);

describe("TileDeltaStringifyCache", () => {
  bench("cold (fresh cache each iteration)", () => {
    const cache = new TileDeltaStringifyCache();
    for (let i = 0; i < N; i++) {
      cache.getOrComputeAll(keys[i]!, tiles[i]!);
    }
  });

  bench("warm (cache pre-populated, same refs)", () => {
    const cache = new TileDeltaStringifyCache();
    // Pre-populate
    for (let i = 0; i < N; i++) {
      cache.getOrComputeAll(keys[i]!, tiles[i]!);
    }
    // Measure warm hits
    for (let i = 0; i < N; i++) {
      cache.getOrComputeAll(keys[i]!, tiles[i]!);
    }
  });
});
