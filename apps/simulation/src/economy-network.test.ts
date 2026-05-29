import { describe, expect, it } from "vitest";
import type { DomainTileState } from "@border-empires/game-domain";
import { buildConnectedTownNetworkForPlayer } from "./economy-network.js";

const townTile = (x: number, y: number, name: string): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: "player-1",
  ownershipState: "SETTLED",
  town: {
    name,
    type: "FARMING",
    populationTier: "TOWN"
  }
});

describe("connected town network", () => {
  it("computes connected town counts by settled-land component", () => {
    const tiles = new Map<string, DomainTileState>(
      [
        townTile(0, 0, "Alpha"),
        townTile(1, 0, "Beta"),
        townTile(10, 10, "Gamma")
      ].map((tile) => [`${tile.x},${tile.y}`, tile])
    );

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    expect(network.get("0,0")).toMatchObject({
      connectedTownCount: 1,
      connectedTownNames: ["Beta"]
    });
    expect(network.get("1,0")).toMatchObject({
      connectedTownCount: 1,
      connectedTownNames: ["Alpha"]
    });
    expect(network.get("10,10")).toMatchObject({
      connectedTownCount: 0
    });
  });

  it("can suppress connected town names while preserving counts and bonuses", () => {
    const tiles = new Map<string, DomainTileState>(
      [
        townTile(0, 0, "Alpha"),
        townTile(1, 0, "Beta"),
        townTile(2, 0, "Gamma")
      ].map((tile) => [`${tile.x},${tile.y}`, tile])
    );

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values(),
      { maxConnectedTownNames: 0 }
    );

    expect(network.get("0,0")).toMatchObject({
      connectedTownCount: 1,
      connectedTownBonus: 0.5
    });
    expect(network.get("0,0")?.connectedTownNames).toBeUndefined();
  });

  it("does not count a town as connected when only reachable through another town", () => {
    // Three towns in a line, each separated by a non-town settled land tile.
    // Layout: Alpha(0,0) — land(1,0) — Beta(2,0) — land(3,0) — Gamma(4,0)
    const landTile = (x: number, y: number): DomainTileState => ({
      x, y, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED"
    });

    const tiles = new Map<string, DomainTileState>([
      ["0,0", townTile(0, 0, "Alpha")],
      ["1,0", landTile(1, 0)],
      ["2,0", townTile(2, 0, "Beta")],
      ["3,0", landTile(3, 0)],
      ["4,0", townTile(4, 0, "Gamma")]
    ]);

    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values()
    );

    // Alpha and Gamma each connect to Beta only — not to each other.
    expect(network.get("0,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
    expect(network.get("2,0")).toMatchObject({ connectedTownCount: 2, connectedTownNames: ["Alpha", "Gamma"] });
    expect(network.get("4,0")).toMatchObject({ connectedTownCount: 1, connectedTownNames: ["Beta"] });
  });
});
