import { describe, expect, it } from "vitest";

import { TILE_YIELD_CAP_RESOURCE, type DomainPlayer, type DomainTileState } from "@border-empires/game-domain";

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

    // 0.75 was the pre-gold-rescope figure; DOCK_INCOME_PER_MIN is now cut
    // 288x (docs/manpower-economy-rewrite-plan.md §6.1), and both fields
    // round to their own fixed precision (roundPositive, tile-yield-view.ts)
    // — 4 digits for the rate, 3 for the 1-minute-elapsed accumulated yield.
    expect(view?.yieldRate.goldPerMinute).toBe(0.0026);
    expect(view?.yield?.gold).toBe(0.003);
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

    // buildTileYieldView rounds the displayed rate (roundPositive, 4 digits)
    // — under the gold rescope (docs/manpower-economy-rewrite-plan.md §6.1)
    // the raw computed value now has many more significant decimals than
    // before, so the rounded display and the raw formula output are no
    // longer byte-identical; toBeCloseTo asserts they round to the same
    // value instead of exact equality.
    expect(view?.yieldRate.goldPerMinute).toBeCloseTo(expectedGoldPerMinute, 4);
    expect(view?.yield?.gold).toBeCloseTo(expectedGoldPerMinute, 3);
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

  it("farm tile yield cap falls back to the default resource cap (no FOOD yield to derive it from)", () => {
    const farmTile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      resource: "FARM"
    };
    const tiles = new Map<string, DomainTileState>([["5,5", farmTile]]);
    const view = buildTileYieldView(farmTile, 0, 60_000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldCap.strategicEach).toBe(TILE_YIELD_CAP_RESOURCE);
  });

  it("farmstead on a farm tile produces no FOOD strategicPerDay (slot-based, not yield-based)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBeUndefined();
  });

  it("farmstead on a fish tile produces no FOOD strategicPerDay (slot-based, not yield-based)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBeUndefined();
  });

  it("waterworks within 10 tiles still produces no FOOD strategicPerDay (slot-based, not yield-based)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.FOOD).toBeUndefined();
  });

  // IRON/CRYSTAL/SUPPLY are slot-based, not tile-yield-produced (§5.1/§5.6) —
  // MINE/CAMP/IRONWORKS/FUR_SYNTHESIZER/CRYSTAL_SYNTHESIZER no longer emit a
  // strategicPerDay entry for these keys.
  it("MINE on an IRON tile produces no IRON strategicPerDay (slot-based, not yield-based)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.IRON).toBeUndefined();
  });

  it("CAMP on a WOOD tile produces no SUPPLY strategicPerDay (slot-based, not yield-based)", () => {
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
    expect(view?.yieldRate.strategicPerDay?.SUPPLY).toBeUndefined();
  });

  it("ADVANCED_IRONWORKS produces no IRON strategicPerDay (slot-based, not yield-based)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "ADVANCED_IRONWORKS", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.IRON).toBeUndefined();
  });

  it("ADVANCED_FUR_SYNTHESIZER produces no SUPPLY strategicPerDay (slot-based, not yield-based)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "ADVANCED_FUR_SYNTHESIZER", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.SUPPLY).toBeUndefined();
  });

  it("ADVANCED_CRYSTAL_SYNTHESIZER produces no CRYSTAL strategicPerDay (slot-based, not yield-based)", () => {
    const tile: DomainTileState = {
      x: 5, y: 5,
      terrain: "LAND",
      ownerId: player.id,
      ownershipState: "SETTLED",
      economicStructure: { type: "ADVANCED_CRYSTAL_SYNTHESIZER", status: "active", ownerId: player.id }
    };
    const tiles = new Map<string, DomainTileState>([["5,5", tile]]);
    const view = buildTileYieldView(tile, 0, 1440 * 60000, { player, tiles, dockLinksByDockTileKey: new Map() });
    expect(view?.yieldRate.strategicPerDay?.CRYSTAL).toBeUndefined();
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

    it("is true for an active FARMSTEAD", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "FARMSTEAD", status: "active", ownerId: "player-1" } })
      ).toBe(true);
    });

    it("is false for an inactive (e.g. under-construction) strategic structure", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "FARMSTEAD", status: "under_construction", ownerId: "player-1" } })
      ).toBe(false);
    });

    it("is false for a MINE (no longer strategic-affecting — IRON is slot-based, not yield-based)", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "MINE", status: "active", ownerId: "player-1" } })
      ).toBe(false);
    });

    it("is false for a non-strategic-affecting structure like MARKET", () => {
      expect(
        tileYieldNeedsServerAuthority({ economicStructure: { type: "MARKET", status: "active", ownerId: "player-1" } })
      ).toBe(false);
    });
  });
});
