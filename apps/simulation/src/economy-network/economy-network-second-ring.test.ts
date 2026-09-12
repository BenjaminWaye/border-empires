import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { countSupportedStructures, hasSupportedStructure, supportTileBelongsToTown } from "./economy-network.js";

// REGRESSION (2026-09-10): the GREAT_CITY/METROPOLIS second support ring
// (distance-2 tiles) exists at the type level (supportRingRadiusForTier), but
// supportTileBelongsToTown's own internal tie-break scan used to bound its
// loop by MAX_SUPPORT_RING_RADIUS *unconditionally* for every player, rather
// than gating the wider scan behind whether the player actually owns a
// GREAT_CITY/METROPOLIS town (playerHasWideSupportRingTown) -- this test
// exercises the actual outcome (a distance-2 structure counting toward a
// GREAT_CITY town), not the internal scan-radius optimization directly.
describe("GREAT_CITY/METROPOLIS second support ring", () => {
  const greatCityTile: DomainTileState = {
    x: 50,
    y: 50,
    terrain: "LAND",
    ownerId: "player-1",
    ownershipState: "SETTLED",
    town: { name: "Aldergate", type: "MARKET", populationTier: "GREAT_CITY" }
  };
  // Distance-2 support tile: within GREAT_CITY's ring, outside the base 8.
  const distance2Structure: DomainTileState = {
    x: 52,
    y: 50,
    terrain: "LAND",
    ownerId: "player-1",
    ownershipState: "SETTLED",
    economicStructure: { ownerId: "player-1", type: "MINTWORKS", status: "active" }
  };
  const tiles = new Map<string, DomainTileState>([
    [`${greatCityTile.x},${greatCityTile.y}`, greatCityTile],
    [`${distance2Structure.x},${distance2Structure.y}`, distance2Structure]
  ]);

  // Skipped (2026-09-12 prod incident): the second ring is reverted again --
  // see town-growth.ts's supportRingRadiusForTier/MAX_SUPPORT_RING_RADIUS
  // comment. playerHasWideSupportRingTown's per-player (not per-town) gate
  // meant every support lookup for a player who owned any GREAT_CITY/
  // METROPOLIS town anywhere paid the wider scan, even nowhere near that
  // town -- one large empire's frontier-eligibility rebuild alone made 6650
  // such lookups in a single call, stacking into the event-loop stalls that
  // caused the incident. Re-enable these once the ring is reintroduced with
  // a cost bound scoped to actual proximity to the wide-ring town.
  it.skip("assigns a distance-2 support tile to its GREAT_CITY town", () => {
    expect(supportTileBelongsToTown("player-1", distance2Structure, greatCityTile, tiles)).toBe(true);
  });

  it.skip("hasSupportedStructure finds a structure on the second ring", () => {
    expect(hasSupportedStructure("player-1", greatCityTile, "MINTWORKS", tiles)).toBe(true);
  });

  it.skip("countSupportedStructures counts a structure on the second ring", () => {
    expect(countSupportedStructures("player-1", greatCityTile, "MINTWORKS", tiles)).toBe(1);
  });

  it("does not assign the same distance-2 tile to a same-owner CITY-tier town (its own radius is only 1)", () => {
    const cityTile: DomainTileState = {
      x: 50,
      y: 50,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      town: { name: "Rookhaven", type: "MARKET", populationTier: "CITY" }
    };
    const cityTiles = new Map<string, DomainTileState>([
      [`${cityTile.x},${cityTile.y}`, cityTile],
      [`${distance2Structure.x},${distance2Structure.y}`, distance2Structure]
    ]);
    expect(supportTileBelongsToTown("player-1", distance2Structure, cityTile, cityTiles)).toBe(false);
    expect(hasSupportedStructure("player-1", cityTile, "MINTWORKS", cityTiles)).toBe(false);
  });

  it("a player with no GREAT_CITY/METROPOLIS town still gets the normal base-8 ring for their CITY town", () => {
    const cityTile: DomainTileState = {
      x: 80,
      y: 80,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED",
      town: { name: "Fenmoor", type: "MARKET", populationTier: "CITY" }
    };
    const distance1Structure: DomainTileState = {
      x: 81,
      y: 80,
      terrain: "LAND",
      ownerId: "player-2",
      ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-2", type: "MINTWORKS", status: "active" }
    };
    const cityTiles = new Map<string, DomainTileState>([
      [`${cityTile.x},${cityTile.y}`, cityTile],
      [`${distance1Structure.x},${distance1Structure.y}`, distance1Structure]
    ]);
    expect(hasSupportedStructure("player-2", cityTile, "MINTWORKS", cityTiles)).toBe(true);
  });
});
