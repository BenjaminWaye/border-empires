/**
 * Correctness gate for player-upkeep-incremental.ts
 *
 * Two test suites:
 *  1. Unit tests — specific scenarios (settled land, forts, structures, etc.)
 *  2. Property test — 1000 random (replaceTileState sequence) → incremental
 *     cache must match full-scan compute exactly.
 */

import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import {
  tileUpkeepContribution,
  addTileUpkeepToCache,
  removeTileUpkeepFromCache,
  buildUpkeepAccrualSnapshot,
  emptyUpkeepAccrualSnapshot,
  type UpkeepAccrualSnapshot
} from "./player-upkeep-incremental.js";
import { buildPlayerUpdateEconomySnapshot } from "../player-update-economy/player-update-economy.js";
import { createEmptyPlayerRuntimeSummary, applyTileToPlayerSummary } from "../player-runtime-summary.js";

const PLAYER_ID = "player-test";

const makePlayer = (overrides: Partial<DomainPlayer> = {}): DomainPlayer => ({
  id: PLAYER_ID,
  isAi: false,
  points: 0,
  manpower: 0,
  techIds: new Set<string>(),
  allies: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  strategicResources: {},
  ...overrides
});

const settledTile = (x: number, y: number, overrides: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: PLAYER_ID,
  ownershipState: "SETTLED",
  ...overrides
});

const summaryForTiles = (tiles: ReadonlyMap<string, DomainTileState>) => {
  const summary = createEmptyPlayerRuntimeSummary();
  for (const [key, tile] of tiles) applyTileToPlayerSummary(summary, key, tile);
  return summary;
};

/** Round to 6 decimal places to avoid floating-point noise. */
const round6 = (n: number): number => Number(n.toFixed(6));

const roundSnapshot = (s: UpkeepAccrualSnapshot): UpkeepAccrualSnapshot => ({
  gold: round6(s.gold),
  food: round6(s.food),
  titanium: round6(s.titanium),
  crystal: round6(s.crystal),
  umbrite: round6(s.umbrite)
});

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

describe("tileUpkeepContribution", () => {
  it("returns zero for non-settled tile", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, { ownershipState: "FRONTIER" });
    expect(tileUpkeepContribution(tile, PLAYER_ID, player)).toEqual(emptyUpkeepAccrualSnapshot());
  });

  it("returns zero for tile owned by someone else", () => {
    const player = makePlayer();
    const tile: DomainTileState = { x: 0, y: 0, terrain: "LAND", ownerId: "other", ownershipState: "SETTLED" };
    expect(tileUpkeepContribution(tile, PLAYER_ID, player)).toEqual(emptyUpkeepAccrualSnapshot());
  });

  it("charges nothing for a plain settled tile (§6: settled-land gold upkeep retired)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0);
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.gold).toBe(0);
    expect(contrib.food).toBe(0);
    expect(contrib.titanium).toBe(0);
    expect(contrib.crystal).toBe(0);
    expect(contrib.umbrite).toBe(0);
  });

  it("charges no WOODEN_FORT upkeep (§12.1: FOOD slot occupation is the upkeep)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      economicStructure: { ownerId: PLAYER_ID, status: "active", type: "WOODEN_FORT" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.gold).toBe(0);
    expect(contrib.food).toBe(0);
  });

  it("charges no fort-ladder upkeep (§12.1: TITANIUM slot occupation is the upkeep)", () => {
    const player = makePlayer();
    for (const variant of ["FORT", "TITANIUM_BASTION", "THUNDER_BASTION"]) {
      const tile = settledTile(0, 0, {
        fort: { ownerId: PLAYER_ID, status: "active", variant }
      });
      const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
      expect(contrib.gold).toBe(0);
      expect(contrib.titanium).toBe(0);
      expect(contrib.food).toBe(0);
    }
  });

  it("charges no siege-ladder upkeep (§12.1: UMBRITE slot occupation is the upkeep)", () => {
    const player = makePlayer();
    for (const variant of ["SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"]) {
      const tile = settledTile(0, 0, {
        siegeOutpost: { ownerId: PLAYER_ID, status: "active", variant }
      });
      const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
      expect(contrib.gold).toBe(0);
      expect(contrib.umbrite).toBe(0);
      expect(contrib.food).toBe(0);
    }
  });

  it("charges no observatory upkeep (§12.1: CRYSTAL slot occupation is the upkeep)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      observatory: { ownerId: PLAYER_ID, status: "active" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.crystal).toBe(0);
  });

  it("charges no airport upkeep (§12.1: CRYSTAL slot occupation is the upkeep)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      economicStructure: { ownerId: PLAYER_ID, status: "active", type: "AIRPORT" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.crystal).toBe(0);
  });

  it("charges no CLEARING_HOUSE upkeep (§12.1: FOOD slot occupation is the upkeep)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      economicStructure: { ownerId: PLAYER_ID, status: "active", type: "CLEARING_HOUSE" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.food).toBe(0);
  });

  it("charges no UMBRITE_RIG gold upkeep (§12.1: FOOD slot occupation is the upkeep)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      economicStructure: { ownerId: PLAYER_ID, status: "active", type: "UMBRITE_RIG" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.gold).toBe(0);
  });

  it("ignores structure owned by someone else", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      economicStructure: { ownerId: "other", status: "active", type: "UMBRITE_RIG" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.gold).toBe(0);
  });

  it("ignores inactive structure", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      economicStructure: { ownerId: PLAYER_ID, status: "building", type: "UMBRITE_RIG" }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.gold).toBe(0);
  });

  it("charges no town food upkeep for CITY tier (§5.4: FOOD is slot-based, not a per-minute stockpile drain)", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      town: { populationTier: "CITY", connectedTownBonus: 0, goldPerMinute: 0 }
    });
    const contrib = tileUpkeepContribution(tile, PLAYER_ID, player);
    expect(contrib.food).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// addTileUpkeepToCache / removeTileUpkeepFromCache
// ---------------------------------------------------------------------------

describe("addTileUpkeepToCache / removeTileUpkeepFromCache", () => {
  it("round-trips: add then remove returns to zero", () => {
    const player = makePlayer();
    const tile = settledTile(0, 0, {
      fort: { ownerId: PLAYER_ID, status: "active" },
      economicStructure: { ownerId: PLAYER_ID, status: "active", type: "UMBRITE_RIG" }
    });
    const cache = emptyUpkeepAccrualSnapshot();
    addTileUpkeepToCache(cache, tile, PLAYER_ID, player);
    removeTileUpkeepFromCache(cache, tile, PLAYER_ID, player);
    expect(roundSnapshot(cache)).toEqual(emptyUpkeepAccrualSnapshot());
  });
});

// ---------------------------------------------------------------------------
// buildUpkeepAccrualSnapshot — matches buildPlayerUpdateEconomySnapshot.upkeepPerMinute
// ---------------------------------------------------------------------------

describe("buildUpkeepAccrualSnapshot vs full snapshot", () => {
  it("matches full snapshot upkeepPerMinute for a single tile", () => {
    const player = makePlayer();
    const tiles = new Map<string, DomainTileState>([
      ["0,0", settledTile(0, 0, { fort: { ownerId: PLAYER_ID, status: "active", variant: "FORT" } })]
    ]);
    const incremental = buildUpkeepAccrualSnapshot(PLAYER_ID, player, tiles);
    const full = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles).upkeepPerMinute;
    expect(roundSnapshot(incremental)).toEqual({
      gold: round6(full.gold),
      food: round6(full.food),
      titanium: round6(full.titanium),
      crystal: round6(full.crystal),
      umbrite: round6(full.umbrite),
    });
  });

  it("matches full snapshot for 50 mixed tiles", () => {
    const player = makePlayer();
    const tiles = new Map<string, DomainTileState>();
    for (let i = 0; i < 50; i++) {
      const x = i;
      const hasClearingHouse = i % 7 === 0;
      const hasFort = i % 5 === 0;
      const hasSiege = i % 11 === 0;
      const isOwned = i % 13 !== 0; // some tiles owned by other player
      tiles.set(`${x},0`, {
        x, y: 0, terrain: "LAND",
        ownerId: isOwned ? PLAYER_ID : "other",
        ownershipState: "SETTLED",
        ...(hasClearingHouse ? { economicStructure: { ownerId: PLAYER_ID, status: "active", type: "CLEARING_HOUSE" } } : {}),
        ...(hasFort && isOwned ? { fort: { ownerId: PLAYER_ID, status: "active", variant: "TITANIUM_BASTION" } } : {}),
        ...(hasSiege && isOwned ? { siegeOutpost: { ownerId: PLAYER_ID, status: "active", variant: "SIEGE_TOWER" } } : {})
      });
    }
    const incremental = buildUpkeepAccrualSnapshot(PLAYER_ID, player, tiles);
    const full = buildPlayerUpdateEconomySnapshot(player, summaryForTiles(tiles), tiles).upkeepPerMinute;
    expect(roundSnapshot(incremental)).toEqual({
      gold: round6(full.gold),
      food: round6(full.food),
      titanium: round6(full.titanium),
      crystal: round6(full.crystal),
      umbrite: round6(full.umbrite),
    });
  });
});

// ---------------------------------------------------------------------------
// Property test: 1000 random replaceTileState sequences
// ---------------------------------------------------------------------------

/** Simple seeded pseudo-random number generator (xorshift32). */
const makeRng = (seed: number) => {
  let s = seed >>> 0;
  return (): number => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0xffffffff;
  };
};

type SimpleTile = DomainTileState;

const STRUCTURE_TYPES = [
  "FARMSTEAD", "UMBRITE_RIG", "MINE", "MARKET", "GRANARY", "CLEARING_HOUSE",
  "WOODEN_FORT", "RELAY_BEACON", "CARAVANARY",
  "UMBRITE_SYNTHESIZER", "TITANIUM_WORKS", "CRYSTAL_SYNTHESIZER",
  "FOUNDRY", "CUSTOMS_HOUSE", "GARRISON_HALL", "GOVERNORS_OFFICE",
  "RADAR_SYSTEM", "AIRPORT"
] as const;

const POPULATION_TIERS = ["SETTLEMENT", "TOWN", "CITY", "GREAT_CITY", "METROPOLIS"] as const;
const FORT_VARIANTS = ["FORT", "TITANIUM_BASTION", "THUNDER_BASTION"] as const;
const SIEGE_VARIANTS = ["SIEGE_OUTPOST", "SIEGE_TOWER", "DREAD_TOWER"] as const;

const randomTile = (rng: () => number, x: number, y: number): SimpleTile => {
  const isOwned = rng() < 0.8;
  const ownerId = isOwned ? PLAYER_ID : "other";
  const ownershipState: DomainTileState["ownershipState"] = rng() < 0.7 ? "SETTLED" : "FRONTIER";
  const hasFort = isOwned && ownershipState === "SETTLED" && rng() < 0.15;
  const hasSiege = isOwned && ownershipState === "SETTLED" && !hasFort && rng() < 0.1;
  const hasObservatory = isOwned && ownershipState === "SETTLED" && rng() < 0.05;
  const hasStructure = isOwned && ownershipState === "SETTLED" && !hasFort && !hasSiege && rng() < 0.3;
  const hasTown = isOwned && ownershipState === "SETTLED" && rng() < 0.2;
  const structureType = STRUCTURE_TYPES[Math.floor(rng() * STRUCTURE_TYPES.length)];
  const fortVariant = FORT_VARIANTS[Math.floor(rng() * FORT_VARIANTS.length)];
  const siegeVariant = SIEGE_VARIANTS[Math.floor(rng() * SIEGE_VARIANTS.length)];
  const populationTier = POPULATION_TIERS[Math.floor(rng() * POPULATION_TIERS.length)];
  return {
    x, y, terrain: "LAND",
    ownerId,
    ownershipState,
    ...(hasFort ? { fort: { ownerId, status: "active" as const, variant: fortVariant } } : {}),
    ...(hasSiege ? { siegeOutpost: { ownerId, status: "active" as const, variant: siegeVariant } } : {}),
    ...(hasObservatory ? { observatory: { ownerId, status: "active" as const } } : {}),
    ...(hasStructure ? { economicStructure: { ownerId, status: "active" as const, type: structureType } } : {}),
    ...(hasTown ? { town: { populationTier, connectedTownBonus: 0, goldPerMinute: 0 } } : {})
  };
};

describe("property test: incremental cache matches full-scan for 1000 sequences", () => {
  it("incremental add/remove always equals buildUpkeepAccrualSnapshot", () => {
    const GRID_SIZE = 20; // 400 tiles
    const MUTATIONS = 40; // mutations per trial
    const TRIALS = 1000;
    const player = makePlayer();

    for (let trial = 0; trial < TRIALS; trial++) {
      const rng = makeRng(trial * 1337 + 42);

      // Initialize a random tile map.
      const tiles = new Map<string, DomainTileState>();
      for (let x = 0; x < GRID_SIZE; x++) {
        for (let y = 0; y < GRID_SIZE; y++) {
          tiles.set(`${x},${y}`, randomTile(rng, x, y));
        }
      }

      // Build initial incremental cache.
      const cache = buildUpkeepAccrualSnapshot(PLAYER_ID, player, tiles);

      // Apply random mutations.
      for (let m = 0; m < MUTATIONS; m++) {
        const x = Math.floor(rng() * GRID_SIZE);
        const y = Math.floor(rng() * GRID_SIZE);
        const key = `${x},${y}`;
        const previous = tiles.get(key)!;
        const next = randomTile(rng, x, y);

        // Subtract previous, add next.
        if (previous.ownerId === PLAYER_ID) {
          removeTileUpkeepFromCache(cache, previous, PLAYER_ID, player);
        }
        tiles.set(key, next);
        if (next.ownerId === PLAYER_ID) {
          addTileUpkeepToCache(cache, next, PLAYER_ID, player);
        }
      }

      // Compare against full-scan.
      const fullScan = buildUpkeepAccrualSnapshot(PLAYER_ID, player, tiles);

      expect(roundSnapshot(cache)).toEqual(roundSnapshot(fullScan));
    }
  });
});
