/**
 * Perf gate for the incremental upkeep cache.
 *
 * Gate: 250k owned tiles, 10k replaceTileState-style O(1) cache updates
 * interleaved with 10k cachedUpkeepAccrual reads, wall time < 200ms.
 */

import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";
import {
  addTileUpkeepToCache,
  removeTileUpkeepFromCache,
  buildUpkeepAccrualSnapshot,
  emptyUpkeepAccrualSnapshot
} from "./player-upkeep-incremental.js";

const PLAYER_ID = "player-perf";

const makePlayer = (): DomainPlayer => ({
  id: PLAYER_ID,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: {}
});

describe("player-upkeep-incremental perf gate", () => {
  it("250k tiles: 10k add/remove + 10k reads < 200ms", () => {
    const TILE_COUNT = 250_000;
    const MUTATIONS = 10_000;
    const READS = 10_000;

    const player = makePlayer();

    // Build a tile map with 250k settled tiles owned by the player.
    const tiles = new Map<string, DomainTileState>();
    for (let i = 0; i < TILE_COUNT; i++) {
      const x = i % 500;
      const y = Math.floor(i / 500);
      tiles.set(`${x},${y}`, {
        x, y, terrain: "LAND",
        ownerId: PLAYER_ID,
        ownershipState: "SETTLED",
        // Sprinkle some forts for realistic upkeep
        ...(i % 100 === 0 ? { fort: { ownerId: PLAYER_ID, status: "active" as const } } : {})
      });
    }

    // Build initial cache — this is O(all tiles) but done once.
    const cache = buildUpkeepAccrualSnapshot(PLAYER_ID, player, tiles);

    const tileKeys = [...tiles.keys()];
    let reads = 0;

    const start = performance.now();

    // Interleave mutations and reads.
    for (let i = 0; i < MUTATIONS; i++) {
      const key = tileKeys[i % tileKeys.length];
      const tile = tiles.get(key)!;
      // Simulate replaceTileState: subtract old, put new, add new.
      removeTileUpkeepFromCache(cache, tile, PLAYER_ID, player);
      const newTile: DomainTileState = { ...tile, ownershipState: i % 2 === 0 ? "SETTLED" : "FRONTIER" };
      tiles.set(key, newTile);
      addTileUpkeepToCache(cache, newTile, PLAYER_ID, player);

      // Interleave a read (simulates applyEconomyAccrual reading the cache).
      if (i % (MUTATIONS / READS) === 0) {
        reads += cache.gold; // force the value to be read
      }
    }

    const elapsed = performance.now() - start;
    // eslint-disable-next-line no-console
    console.log(`[perf-gate] 250k tiles, ${MUTATIONS} mutations, ${READS} reads: ${Math.round(elapsed)}ms (reads=${Math.round(reads)})`);

    expect(elapsed, `incremental upkeep cache took ${Math.round(elapsed)}ms — must be < 200ms`).toBeLessThan(200);
  });
});
