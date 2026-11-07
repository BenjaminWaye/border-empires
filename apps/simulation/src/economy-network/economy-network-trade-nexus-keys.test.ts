import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildConnectedTownNetworkForPlayer } from "./economy-network.js";

const townTile = (x: number, y: number, name: string): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
  town: { name, type: "FARMING", populationTier: "TOWN" }
});

const tradeNexusTile = (x: number, y: number): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
  economicStructure: { ownerId: "player-1", type: "TRADE_NEXUS" as const, status: "active" as const }
});

const networkFor = (tiles: DomainTileState[]) => {
  const byKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  return buildConnectedTownNetworkForPlayer({ id: "player-1", techIds: [], domainIds: [] }, byKey, byKey.values());
};

// Town stats name the town whose Trade Nexus switches on the connected-town
// coin bonus, so the network entry must say which towns hold one.
describe("connectedTradeNexusKeys", () => {
  it("lists the Trade Nexus town for itself and its connected towns", () => {
    const network = networkFor([townTile(0, 0, "Alpha"), townTile(1, 0, "Beta"), tradeNexusTile(0, 1)]);
    expect(network.get("0,0")).toMatchObject({ connectedTownBonus: 0.5, connectedTradeNexusKeys: ["0,0"] });
    expect(network.get("1,0")).toMatchObject({ connectedTownBonus: 0.5, connectedTradeNexusKeys: ["0,0"] });
  });

  it("omits the keys when no town in the network has a Trade Nexus", () => {
    const network = networkFor([townTile(0, 0, "Alpha"), townTile(1, 0, "Beta")]);
    expect(network.get("0,0")?.connectedTownBonus).toBe(0);
    expect(network.get("0,0")?.connectedTradeNexusKeys).toBeUndefined();
  });
});
