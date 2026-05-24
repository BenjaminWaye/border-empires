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
      connectedTownCount: 2,
      connectedTownBonus: 0.9
    });
    expect(network.get("0,0")?.connectedTownNames).toBeUndefined();
  });

  it("visits each settled land tile once for a large connected town component", () => {
    const width = 35;
    const height = 35;
    const tiles = new Map<string, DomainTileState>();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const tile = townTile(x, y, `Town ${x},${y}`);
        tiles.set(`${tile.x},${tile.y}`, tile);
      }
    }

    const visited = new Map<string, number>();
    const network = buildConnectedTownNetworkForPlayer(
      { id: "player-1", techIds: [], domainIds: [] },
      tiles,
      tiles.values(),
      {
        maxConnectedTownNames: 0,
        onVisitSettledLandTile: (tileKey) => visited.set(tileKey, (visited.get(tileKey) ?? 0) + 1)
      }
    );

    expect(network.size).toBe(width * height);
    expect(visited.size).toBe(width * height);
    expect(Math.max(...visited.values())).toBe(1);
    expect(network.get("0,0")).toMatchObject({
      connectedTownCount: width * height - 1,
      connectedTownBonus: 1.2
    });
    expect(network.get("0,0")?.connectedTownNames).toBeUndefined();
  });
});
