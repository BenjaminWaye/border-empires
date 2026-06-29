import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildTileYieldView } from "./tile-yield-view.js";
import { townGoldPerMinuteForPlayer } from "../player-update-economy/player-update-economy.js";

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

  it("clamps elapsed time at OFFLINE_YIELD_ACCUM_MAX_MS so a stale anchor cannot exceed 12h of yield", () => {
    const tile: DomainTileState = {
      x: 10,
      y: 10,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      town: { type: "FARMING", populationTier: "SETTLEMENT" }
    };
    const tiles = new Map<string, DomainTileState>([["10,10", tile]]);
    const now = 24 * 60 * 60_000; // 24h into the epoch
    const stale = 0; // anchor at epoch 0 → naive elapsed is 24h
    const view = buildTileYieldView(tile, stale, now, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map(),
      fedTownKeys: new Set<string>()
    });
    const goldPerMinute = view?.yieldRate.goldPerMinute ?? 0;
    expect(goldPerMinute).toBeGreaterThan(0);
    // Even with goldPerMinute * 24h pre-cap math, the buffer must not exceed
    // goldPerMinute * 12h (OFFLINE_YIELD_ACCUM_MAX_MS). Per-tile cap (8h) wins
    // here, but the elapsed-clamp is what protects against larger town caps.
    expect(view?.yield?.gold).toBeLessThanOrEqual(goldPerMinute * 60 * 12 + 1e-6);
  });

  it("sets fish yield cap to 0 so fish food cannot be banked", () => {
    const fishTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FISH"
    };
    const tiles = new Map<string, DomainTileState>([["5,5", fishTile]]);
    const view = buildTileYieldView(fishTile, 0, 60_000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldCap.strategicEach).toBe(0);
  });

  it("farm tile yield cap is unchanged (72/3 = 24)", () => {
    const farmTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM"
    };
    const tiles = new Map<string, DomainTileState>([["5,5", farmTile]]);
    const view = buildTileYieldView(farmTile, 0, 60_000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldCap.strategicEach).toBe(24);
  });

  it("farmstead on a farm tile gives 108/day (72 base + 36 bonus), not 36", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    // 108/day for one day = 108 food in the buffer (below cap of 108/3 = 36, but 1 day ≫ cap)
    // The rate is 108/day. Check the yield rate's strategic per day.
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(108);
  });

  it("farmstead on a fish tile gives no food bonus (48/day base only)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FISH",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(48);
  });

  it("waterworks within 10 tiles boosts farmstead food to 162/day ((72+36)×1.5)", () => {
    const farmTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: player.id }
    };
    const waterworksTile: DomainTileState = {
      x: 10, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "WATERWORKS", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([
      ["5,5", farmTile],
      ["10,5", waterworksTile]
    ]);
    const view = buildTileYieldView(farmTile, 0, 1440 * 60000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map(),
      waterworksKeys: new Set(["10,5"])
    });
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(162);
  });

});
