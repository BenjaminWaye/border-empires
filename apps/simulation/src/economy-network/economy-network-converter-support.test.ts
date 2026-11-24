import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { WORLD_WIDTH } from "@border-empires/shared";
import { supportedConverterGoldPerMinuteForTown } from "./economy-network-converter-support.js";

// REGRESSION (2026-09-10): this scan feeds real, live gold-crediting math
// (see this file's own doc comment: "feeding the actual live gold-crediting
// math") -- it used to be hardcoded to radius 1 with a raw (non-wrapped)
// neighbor key regardless of the town's tier, so a GREAT_CITY/METROPOLIS
// town's EXCHANGE-mode converters (Aether Condenser/Titanium Works/Umbrite
// Works) out on the second ring were silently never credited, and a
// converter right at a world edge was missed entirely.
describe("supportedConverterGoldPerMinuteForTown", () => {
  it("credits an EXCHANGE-mode converter on a GREAT_CITY town's distance-2 support tile, wrapping at the map edge", () => {
    const greatCity: DomainTileState = {
      x: 0,
      y: 20,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      town: { name: "Aldergate", type: "MARKET", populationTier: "GREAT_CITY" }
    };
    const farConverter: DomainTileState = {
      x: WORLD_WIDTH - 2, // two tiles west of x=0, wraps around
      y: 20,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "player-1",
        type: "TITANIUM_WORKS",
        status: "active",
        converterMode: "EXCHANGE"
      }
    };
    const tiles = new Map<string, DomainTileState>([
      ["0,20", greatCity],
      [`${WORLD_WIDTH - 2},20`, farConverter]
    ]);

    const result = supportedConverterGoldPerMinuteForTown("player-1", greatCity, tiles);

    expect(result.total).toBeGreaterThan(0);
    expect(result.claimedTileKeys.has(`${WORLD_WIDTH - 2},20`)).toBe(true);
  });

  it("does not credit a distance-2 converter for a CITY-tier town (its own radius is only 1)", () => {
    const cityTown: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      town: { name: "Rookhaven", type: "MARKET", populationTier: "CITY" }
    };
    const farConverter: DomainTileState = {
      x: 12,
      y: 10,
      terrain: "LAND",
      ownerId: "player-1",
      ownershipState: "SETTLED",
      economicStructure: {
        ownerId: "player-1",
        type: "TITANIUM_WORKS",
        status: "active",
        converterMode: "EXCHANGE"
      }
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", cityTown],
      ["12,10", farConverter]
    ]);

    const result = supportedConverterGoldPerMinuteForTown("player-1", cityTown, tiles);

    expect(result.total).toBe(0);
    expect(result.claimedTileKeys.size).toBe(0);
  });
});
