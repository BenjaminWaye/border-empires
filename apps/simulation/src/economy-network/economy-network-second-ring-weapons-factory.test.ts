import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildConnectedTownNetworkForPlayer } from "./economy-network.js";

// REGRESSION (2026-09-10): countWeaponsFactoriesAt's own neighbor scan was
// hardcoded to radius 1 regardless of the town's tier, so a GREAT_CITY/
// METROPOLIS town's factories on its second (distance-2) ring were never
// counted toward the network combat bonus. Split into its own file rather
// than added to economy-network.test.ts, which is already over the repo's
// 500-line cap.
describe("network-clustered combat bonus: second support ring", () => {
  it("counts a distance-2 Titanium Weapons Factory for a GREAT_CITY town", () => {
    const factoryTile = (x: number, y: number): DomainTileState => ({
      x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
      economicStructure: { ownerId: "player-1", type: "TITANIUM_WEAPONS_FACTORY" as const, status: "active" as const }
    });
    const greatCityKey = "10,10";
    const tiles = new Map<string, DomainTileState>([
      [greatCityKey, { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Aldergate", type: "MARKET", populationTier: "GREAT_CITY" } }],
      ["12,10", factoryTile(12, 10)] // distance 2
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.get(greatCityKey)!.connectedTitaniumWeaponsFactoryCount).toBe(1);
  });
});
