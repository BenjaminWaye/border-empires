import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildTileYieldView } from "./tile-yield-view.js";
import { townGoldPerMinuteForPlayer } from "./player-update-economy.js";

const player: Pick<DomainPlayer, "id" | "techIds" | "domainIds" | "mods"> = {
  id: "player-1",
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 }
};

describe("buildTileYieldView", () => {
  it("uses connected dock route income for buffered gold yield", () => {
    const dockA: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      dockId: "dock-a"
    };
    const dockB: DomainTileState = {
      x: 50,
      y: 50,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      dockId: "dock-b"
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,10", dockA],
      ["50,50", dockB]
    ]);

    const view = buildTileYieldView(dockA, 0, 60_000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map([
        ["10,10", ["50,50"]],
        ["50,50", ["10,10"]]
      ])
    });

    expect(view?.yieldRate.goldPerMinute).toBe(0.75);
    expect(view?.yield?.gold).toBe(0.75);
  });

  it("uses the authoritative town income formula for buffered town gold", () => {
    const townTile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: {
        type: "MARKET",
        populationTier: "CITY",
        connectedTownCount: 1,
        connectedTownBonus: 0.5
      }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", townTile]]);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = townTile.x + dx;
        const y = townTile.y + dy;
        tiles.set(`${x},${y}`, {
          x,
          y,
          terrain: "LAND",
          ownerId: player.id,
          ownershipState: "SETTLED",
          ...(dx === 1 && dy === 0
            ? { economicStructure: { type: "MARKET", status: "active", ownerId: player.id } }
            : {})
        });
      }
    }

    const fedTownKeys = new Set<string>(["10,10"]);
    const expectedGoldPerMinute = townGoldPerMinuteForPlayer(player, townTile, townTile.town!, tiles, fedTownKeys);
    const view = buildTileYieldView(townTile, 0, 60_000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map(),
      fedTownKeys
    });

    expect(view?.yieldRate.goldPerMinute).toBe(expectedGoldPerMinute);
    expect(view?.yield?.gold).toBe(expectedGoldPerMinute);
  });
});
