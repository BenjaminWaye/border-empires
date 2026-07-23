import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";

import { buildConnectedTownNetworkForPlayer, type EconomyPlayer } from "./economy-network.js";
import { createTownConnectivityState } from "./town-connectivity-incremental.js";
import { refreshEconomyCachesForTileChange } from "../runtime-tile-index-maintenance.js";
import type { RuntimePlayer } from "../runtime-types.js";

/**
 * Differential test: the incremental union-find path must be observationally
 * identical to the from-scratch BFS, for randomized worlds AND across
 * randomized mutation sequences routed through the real maintenance wiring
 * (refreshEconomyCachesForTileChange).
 *
 * This exists because a hand-picked-cases-only suite already let a real bug
 * through once: an earlier union-find drafted over *all* settled tiles merged
 * towns that the BFS treats as separated (real towns are connectivity
 * barriers), silently inflating connectedTownCount/connectedTownBonus. Only a
 * case with three towns in a line exposed it, so the guard here is randomized
 * rather than enumerated.
 */

// Deterministic PRNG (mulberry32) so failures are reproducible from the seed.
const makeRng = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const PLAYER_ID = "player-1";
const player: EconomyPlayer = { id: PLAYER_ID, techIds: [], domainIds: [] };

type TileKind =
  | "none" | "corridor" | "settlement" | "town" | "enemy"
  | "sea" | "coastalSea" | "mountain" | "frontier" | "clearingHouse";

const buildTile = (x: number, y: number, kind: TileKind): DomainTileState | undefined => {
  switch (kind) {
    case "none":
      return undefined;
    // Non-LAND terrain is owned+SETTLED but must still be excluded from both
    // the town set and the corridor set.
    case "sea":
      return { x, y, terrain: "SEA", ownerId: PLAYER_ID, ownershipState: "SETTLED" };
    case "coastalSea":
      return { x, y, terrain: "COASTAL_SEA", ownerId: PLAYER_ID, ownershipState: "SETTLED" };
    case "mountain":
      return { x, y, terrain: "MOUNTAIN", ownerId: PLAYER_ID, ownershipState: "SETTLED" };
    // Owned LAND that isn't SETTLED — also excluded.
    case "frontier":
      return { x, y, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "FRONTIER" };
    case "enemy":
      return { x, y, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" };
    case "corridor":
      return { x, y, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED" };
    case "clearingHouse":
      return {
        x, y, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED",
        economicStructure: { ownerId: PLAYER_ID, type: "CLEARING_HOUSE", status: "active" }
      };
    case "settlement":
      return {
        x, y, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED",
        town: { name: `S${x}-${y}`, type: "FARMING", populationTier: "SETTLEMENT" }
      };
    case "town":
      return {
        x, y, terrain: "LAND", ownerId: PLAYER_ID, ownershipState: "SETTLED",
        town: { name: `T${x}-${y}`, type: "FARMING", populationTier: "TOWN" }
      };
  }
};

const KINDS: TileKind[] = [
  "none", "corridor", "settlement", "town", "enemy",
  "sea", "coastalSea", "mountain", "frontier", "clearingHouse"
];

const maintenanceInput = (townConnectivityStateByPlayer: Map<string, ReturnType<typeof createTownConnectivityState>>) => ({
  players: new Map<string, RuntimePlayer>(),
  economySnapshotCacheByPlayer: new Map(),
  tileYieldContextCacheByPlayer: new Map(),
  townNetworkCacheByPlayer: new Map(),
  townConnectivityStateByPlayer,
  defensibilityMetricsCacheByPlayer: new Map(),
  upkeepAccrualCacheByPlayer: new Map()
});

describe("town connectivity — incremental vs from-scratch differential", () => {
  it("matches the BFS result for randomized worlds", () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = makeRng(seed);
      const size = 6;
      const tiles = new Map<string, DomainTileState>();
      for (let x = 0; x < size; x += 1) {
        for (let y = 0; y < size; y += 1) {
          const kind = KINDS[Math.floor(rng() * KINDS.length)]!;
          const tile = buildTile(x, y, kind);
          if (tile) tiles.set(`${x},${y}`, tile);
        }
      }

      const expected = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { maxConnectedTownNames: 16 });
      const state = createTownConnectivityState();
      const actual = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), {
        maxConnectedTownNames: 16,
        incrementalState: state
      });

      expect(actual, `seed ${seed}`).toEqual(expected);
    }
  });

  it("agrees with the BFS across the world-wrap seam", () => {
    // Tile map keys are raw "x,y" while neighbor lookups wrap, so a town at
    // x=0 and one at x=WORLD_WIDTH-1 are 8-adjacent through the seam. Both
    // paths must see that identically.
    const tiles = new Map<string, DomainTileState>([
      [`${WORLD_WIDTH - 1},10`, buildTile(WORLD_WIDTH - 1, 10, "town")!],
      ["0,10", buildTile(0, 10, "corridor")!],
      ["1,10", buildTile(1, 10, "town")!]
    ]);

    const expected = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { maxConnectedTownNames: 16 });
    const state = createTownConnectivityState();
    const actual = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), {
      maxConnectedTownNames: 16,
      incrementalState: state
    });

    expect(actual).toEqual(expected);
    // Sanity: the seam really did connect them (otherwise this asserts nothing).
    expect(expected.get(`${WORLD_WIDTH - 1},10`)?.connectedTownCount).toBe(1);
  });

  it("stays correct across randomized mutation sequences routed through refreshEconomyCachesForTileChange", () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rng = makeRng(seed * 7919);
      const size = 5;
      const tiles = new Map<string, DomainTileState>();
      for (let x = 0; x < size; x += 1) {
        for (let y = 0; y < size; y += 1) {
          const kind = KINDS[Math.floor(rng() * KINDS.length)]!;
          const tile = buildTile(x, y, kind);
          if (tile) tiles.set(`${x},${y}`, tile);
        }
      }

      const townConnectivityStateByPlayer = new Map([[PLAYER_ID, createTownConnectivityState()]]);
      const state = townConnectivityStateByPlayer.get(PLAYER_ID)!;

      // Prime the structure once, as the runtime would on first read.
      buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), {
        maxConnectedTownNames: 16,
        incrementalState: state
      });

      for (let step = 0; step < 40; step += 1) {
        const x = Math.floor(rng() * size);
        const y = Math.floor(rng() * size);
        const tileKey = `${x},${y}`;
        const kind = KINDS[Math.floor(rng() * KINDS.length)]!;
        const previous = tiles.get(tileKey);
        const next = buildTile(x, y, kind);

        if (next) tiles.set(tileKey, next);
        else tiles.delete(tileKey);

        // A tile disappearing entirely has no "next" state to hand the
        // maintenance hook; the runtime models that as an ownership loss, so
        // mirror it with an unowned LAND tile.
        const nextForMaintenance: DomainTileState = next ?? { x, y, terrain: "LAND" };
        refreshEconomyCachesForTileChange({
          tileKey,
          previous,
          next: nextForMaintenance,
          ...maintenanceInput(townConnectivityStateByPlayer)
        });

        const expected = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), { maxConnectedTownNames: 16 });
        const actual = buildConnectedTownNetworkForPlayer(player, tiles, tiles.values(), {
          maxConnectedTownNames: 16,
          incrementalState: state
        });
        expect(actual, `seed ${seed} step ${step} @ ${tileKey} -> ${kind}`).toEqual(expected);
      }
    }
  });
});
