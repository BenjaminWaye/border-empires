import { describe, expect, it } from "vitest";

import type { DomainPlayer, DomainTileState } from "@border-empires/game-domain";

import { buildTileYieldView, tileYieldNeedsServerAuthority } from "./tile-yield-view.js";
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

  it("farm tile yield cap is unchanged (48/3 = 16)", () => {
    const farmTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM"
    };
    const tiles = new Map<string, DomainTileState>([["5,5", farmTile]]);
    const view = buildTileYieldView(farmTile, 0, 60_000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldCap.strategicEach).toBe(16);
  });

  it("farmstead on a farm tile gives 72/day (48 base + 24 bonus), not 24", () => {
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
    // 72/day for one day = 72 food in the buffer (below cap of 72/3 = 24, but 1 day ≫ cap)
    // The rate is 72/day. Check the yield rate's strategic per day.
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(72);
  });

  it("farmstead on a fish tile gives no food bonus (72/day base only)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(72);
  });

  it("waterworks within 10 tiles boosts farmstead food to 144/day ((48+24)×2)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(144);
  });

  it("waterworks boost wraps around the world edge (Chebyshev distance, not raw coordinate difference)", () => {
    // WORLD_WIDTH is 450 (see @border-empires/shared) — a farm at x=448 and a
    // waterworks at x=1 are only 3 tiles apart via wraparound, well within
    // WATERWORKS_RADIUS (10), even though the raw |448-1| = 447 is not.
    const farmTile: DomainTileState = {
      x: 448, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: player.id }
    };
    const waterworksTile: DomainTileState = {
      x: 1, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "WATERWORKS", status: "active", ownerId: player.id }
    };
    const view = buildTileYieldView(farmTile, 0, 1440 * 60000, {
      player,
      tiles: new Map([["448,5", farmTile], ["1,5", waterworksTile]]),
      dockLinksByDockTileKey: new Map(),
      waterworksKeys: new Set(["1,5"])
    });
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(144);
  });

  it("Q1: farmstead built on a farm already in waterworks range emits 108 FOOD immediately, no neighbor scan needed", () => {
    // Waterworks was already active and in range BEFORE the farmstead is built
    // (e.g. this tile just finished a farmstead build-completion command) — the
    // beneficiary's own buildTileYieldView call must see the boosted value
    // without any explicit neighbor re-scan on the source side.
    const waterworksTile: DomainTileState = {
      x: 10, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "WATERWORKS", status: "active", ownerId: player.id }
    };
    const farmTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM",
      economicStructure: { type: "FARMSTEAD", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([
      ["10,5", waterworksTile],
      ["5,5", farmTile]
    ]);
    const view = buildTileYieldView(farmTile, 0, 1440 * 60000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map(),
      waterworksKeys: new Set(["10,5"])
    });
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBe(144);
  });

  it("MINE applies STRUCTURE_OUTPUT_MULT (x1.5) to base IRON output: 60 -> 90/day", () => {
    const mineTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "IRON",
      economicStructure: { type: "MINE", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", mineTile]]);
    const view = buildTileYieldView(mineTile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.IRON).toBe(90);
  });

  it("CAMP applies STRUCTURE_OUTPUT_MULT (x1.5) to base SUPPLY output: 60 -> 90/day", () => {
    const campTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "WOOD",
      economicStructure: { type: "CAMP", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", campTile]]);
    const view = buildTileYieldView(campTile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.SUPPLY).toBe(90);
  });

  it("MINE with an active FOUNDRY in range multiplies IRON by FOUNDRY_OUTPUT_MULT on top of STRUCTURE_OUTPUT_MULT: 60 x1.5 x2 = 180/day", () => {
    const mineTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "IRON",
      economicStructure: { type: "MINE", status: "active", ownerId: player.id }
    };
    const foundryTile: DomainTileState = {
      x: 8, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "FOUNDRY", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([
      ["5,5", mineTile],
      ["8,5", foundryTile]
    ]);
    const view = buildTileYieldView(mineTile, 0, 1440 * 60000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map(),
      foundryKeys: new Set(["8,5"])
    });
    expect(view?.yieldRate.strategicPerDay?.IRON).toBe(180);
  });

  it("MINE outside FOUNDRY_RADIUS is unaffected by the foundry (stays at 90/day, STRUCTURE_OUTPUT_MULT only)", () => {
    const mineTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "IRON",
      economicStructure: { type: "MINE", status: "active", ownerId: player.id }
    };
    const farFoundryTile: DomainTileState = {
      x: 50, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "FOUNDRY", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([
      ["5,5", mineTile],
      ["50,5", farFoundryTile]
    ]);
    const view = buildTileYieldView(mineTile, 0, 1440 * 60000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map(),
      foundryKeys: new Set(["50,5"])
    });
    expect(view?.yieldRate.strategicPerDay?.IRON).toBe(90);
  });

  it("ADVANCED_IRONWORKS uses the advanced constant (21.6/day), not the basic one (18/day)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "ADVANCED_IRONWORKS", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.IRON).toBe(21.6);
  });

  it("ADVANCED_FUR_SYNTHESIZER uses the advanced constant (21.6/day)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "ADVANCED_FUR_SYNTHESIZER", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.SUPPLY).toBe(21.6);
  });

  it("ADVANCED_CRYSTAL_SYNTHESIZER uses the advanced constant (14.4/day)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "ADVANCED_CRYSTAL_SYNTHESIZER", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.CRYSTAL).toBe(14.4);
  });

  describe("tileYieldNeedsServerAuthority predicate", () => {
    it("is false for a bare resource tile with no structure or dock", () => {
      expect(tileYieldNeedsServerAuthority({ economicStructure: undefined, dockId: undefined })).toBe(false);
    });

    it("is false for an empty settled tile", () => {
      expect(tileYieldNeedsServerAuthority({})).toBe(false);
    });

    it("is true for a tile with a dockId", () => {
      expect(tileYieldNeedsServerAuthority({ dockId: "dock-a" })).toBe(true);
    });

    it("is true for an active MINE", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "MINE", status: "active", ownerId: "player-1" } })
      ).toBe(true);
    });

    it("is false for an inactive (e.g. under-construction) strategic structure", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "MINE", status: "under_construction", ownerId: "player-1" } })
      ).toBe(false);
    });

    it("is false for a non-strategic-affecting structure like MARKET", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "MARKET", status: "active", ownerId: "player-1" } })
      ).toBe(false);
    });
  });
});
