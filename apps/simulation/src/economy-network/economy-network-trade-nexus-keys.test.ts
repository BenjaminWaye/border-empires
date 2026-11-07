import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildConnectedTownNetworkForPlayer, enrichTownWithConnectedNetwork } from "./economy-network.js";

const townTile = (x: number, y: number, name: string): DomainTileState => ({
  x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
  town: { name, type: "FARMING", populationTier: "TOWN" }
});

const landTile = (x: number, y: number): DomainTileState => ({ x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });

const tradeNexusTile = (x: number, y: number): DomainTileState => ({
  ...landTile(x, y),
  economicStructure: { ownerId: "player-1", type: "TRADE_NEXUS" as const, status: "active" as const }
});

const networkFor = (tiles: DomainTileState[]) => {
  const byKey = new Map(tiles.map((tile) => [`${tile.x},${tile.y}`, tile]));
  return buildConnectedTownNetworkForPlayer({ id: "player-1", techIds: [], domainIds: [] }, byKey, byKey.values());
};

// Town stats name the town whose Trade Nexus switches on the connected-town
// coin bonus, so the network entry must say which towns hold one.
describe("connectedTradeNexusTownNames", () => {
  it("names the Trade Nexus town for itself and a directly connected town", () => {
    // Nexus at (4,5) touches only Alpha's support ring.
    const network = networkFor([townTile(5, 5, "Alpha"), townTile(6, 5, "Beta"), tradeNexusTile(4, 5)]);
    expect(network.get("5,5")).toMatchObject({ connectedTownBonus: 0.5, connectedTradeNexusTownNames: ["Alpha"] });
    expect(network.get("6,5")).toMatchObject({ connectedTownBonus: 0.5, connectedTradeNexusTownNames: ["Alpha"] });
  });

  it("names it across a shared corridor group (single-group fast path)", () => {
    // Alpha (5,5) and Gamma (7,5) touch only through the corridor tile (6,5).
    const network = networkFor([townTile(5, 5, "Alpha"), landTile(6, 5), townTile(7, 5, "Gamma"), tradeNexusTile(4, 5)]);
    expect(network.get("7,5")).toMatchObject({ connectedTownCount: 1, connectedTownBonus: 0.5, connectedTradeNexusTownNames: ["Alpha"] });
  });

  it("omits the names when no town in the network has a Trade Nexus", () => {
    const network = networkFor([townTile(5, 5, "Alpha"), townTile(6, 5, "Beta")]);
    expect(network.get("5,5")?.connectedTownBonus).toBe(0);
    expect(network.get("5,5")?.connectedTradeNexusTownNames).toBeUndefined();
  });
});

// Live tile deltas and tile-detail fetches rebuild the town through
// enrichTownWithConnectedNetwork, so the names must be set (and cleared) there.
describe("enrichTownWithConnectedNetwork — tradeNexusTownNames", () => {
  const beta: DomainTileState = { ...townTile(6, 5, "Beta"), town: { name: "Beta", type: "FARMING", populationTier: "TOWN", tradeNexusTownNames: ["Avalon"] } };

  it("replaces stale names with the network's current ones", () => {
    const town = enrichTownWithConnectedNetwork(beta, new Map([["6,5", { connectedTownCount: 1, connectedTownBonus: 0.5, connectedTradeNexusTownNames: ["Alpha"] }]]));
    expect(town?.tradeNexusTownNames).toEqual(["Alpha"]);
  });

  it("drops the names once the network no longer has a Trade Nexus", () => {
    const town = enrichTownWithConnectedNetwork(beta, new Map([["6,5", { connectedTownCount: 1, connectedTownBonus: 0 }]]));
    expect(town?.tradeNexusTownNames).toBeUndefined();
  });
});
