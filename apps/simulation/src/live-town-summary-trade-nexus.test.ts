import { describe, expect, it } from "vitest";
import { buildTownSummary } from "./live-town-summary.js";
import { keyFor } from "./snapshot-tile-cache.js";
import type { ConnectedTownNetworkEntry } from "./economy-network/economy-network.js";

type FixtureTile = Record<string, unknown> & { x: number; y: number };

const townTile = (x: number, y: number, name: string): FixtureTile => ({
  x, y, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", townType: "MARKET", townPopulationTier: "TOWN", townName: name,
  townJson: JSON.stringify({ name, type: "MARKET", populationTier: "TOWN", population: 20_000, maxPopulation: 100_000 })
});

// The town stats name the town whose Trade Nexus powers the connected-town
// coin bonus; previously the wire summary never said where it came from.
describe("buildTownSummary — tradeNexusTownNames", () => {
  it("names the network towns holding the Trade Nexus", () => {
    const alpha = townTile(10, 10, "Alpha");
    const beta = townTile(11, 10, "Beta");
    const tilesByKey = new Map([alpha, beta].map((t) => [keyFor(t.x, t.y), t as never]));
    const network = new Map<string, ConnectedTownNetworkEntry>([
      ["11,10", { connectedTownCount: 1, connectedTownBonus: 0.5, connectedTradeNexusTownNames: ["Alpha"] }]
    ]);
    const summary = buildTownSummary(beta as never, undefined, tilesByKey, new Set(), true, network);
    expect(summary?.connectedTownBonus).toBe(0.5);
    expect(summary?.tradeNexusTownNames).toEqual(["Alpha"]);
  });

  it("omits the names when the network has no Trade Nexus", () => {
    const alpha = townTile(10, 10, "Alpha");
    const tilesByKey = new Map([[keyFor(10, 10), alpha as never]]);
    const network = new Map<string, ConnectedTownNetworkEntry>([["10,10", { connectedTownCount: 1, connectedTownBonus: 0 }]]);
    const summary = buildTownSummary(alpha as never, undefined, tilesByKey, new Set(), true, network);
    expect(summary?.tradeNexusTownNames).toBeUndefined();
  });
});
