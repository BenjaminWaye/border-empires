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

const settled = (x: number, y: number, extra: Partial<DomainTileState> = {}): DomainTileState => ({
  x,
  y,
  terrain: "LAND",
  ownerId: player.id,
  ownershipState: "SETTLED",
  ...extra
});

describe("buildTileYieldView", () => {
  it("uses connected dock route income for the dock gold rate", () => {
    const dockA = settled(10, 10, { dockId: "dock-a" });
    const dockB = settled(50, 50, { dockId: "dock-b" });
    const tiles = new Map<string, DomainTileState>([
      ["10,10", dockA],
      ["50,50", dockB]
    ]);

    const view = buildTileYieldView(dockA, 60_000, {
      player,
      tiles,
      dockLinksByDockTileKey: new Map([
        ["10,10", ["50,50"]],
        ["50,50", ["10,10"]]
      ])
    });

    // DOCK_INCOME_PER_MIN is cut 288x by the gold rescope; the rate rounds to
    // 4 digits (roundPositive, tile-yield-view.ts).
    expect(view?.yieldRate.goldPerMinute).toBe(0.0026);
  });

  it("uses the authoritative town income formula for the town gold rate", () => {
    const townTile = settled(10, 10, {
      town: { type: "MARKET", populationTier: "CITY", connectedTownCount: 1, connectedTownBonus: 0.5 }
    });
    const tiles = new Map<string, DomainTileState>([["10,10", townTile]]);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        if (dx === 0 && dy === 0) continue;
        const x = townTile.x + dx;
        const y = townTile.y + dy;
        tiles.set(
          `${x},${y}`,
          settled(x, y, dx === 1 && dy === 0 ? { economicStructure: { type: "MANUFACTORY", status: "active", ownerId: player.id } } : {})
        );
      }
    }

    const fedTownKeys = new Set<string>(["10,10"]);
    const expectedGoldPerMinute = townGoldPerMinuteForPlayer(player, townTile, townTile.town!, tiles, fedTownKeys);
    const view = buildTileYieldView(townTile, 60_000, { player, tiles, dockLinksByDockTileKey: new Map(), fedTownKeys });

    // The displayed rate is rounded to 4 digits, so compare at that precision.
    expect(view?.yieldRate.goldPerMinute).toBeCloseTo(expectedGoldPerMinute, 4);
  });

  it("zeroes the gold rate while a Siphon sabotage is active", () => {
    const tile = settled(10, 10, {
      town: { type: "FARMING", populationTier: "SETTLEMENT" },
      sabotage: { ownerId: "rival", endsAt: 120_000, outputMultiplier: 0 }
    });

    const view = buildTileYieldView(tile, 60_000);

    expect(view?.yieldRate.goldPerMinute).toBe(0);
  });

  // Regression: tiles used to carry a stored-yield buffer (`yield`) and cap
  // (`yieldCap`) that the client rendered as a "ready to collect" marker.
  // Tiles don't hold yield any more — only the rate is returned.
  it("returns only the gold rate — no stored-yield buffer or cap, however long since the last tick", () => {
    const tile = settled(10, 10, { town: { type: "FARMING", populationTier: "SETTLEMENT" } });

    const view = buildTileYieldView(tile, 48 * 60 * 60_000);

    expect(view).toEqual({ yieldRate: { goldPerMinute: expect.any(Number) } });
    expect(view?.yieldRate.goldPerMinute).toBeGreaterThan(0);
  });

  it("returns a zero gold rate for a bare resource tile (strategic resources are slot-based)", () => {
    const view = buildTileYieldView(settled(5, 5, { resource: "FARM" }), 60_000);

    expect(view).toEqual({ yieldRate: { goldPerMinute: 0 } });
  });

  it("returns undefined for an unowned or unsettled tile", () => {
    expect(buildTileYieldView({ x: 1, y: 1, terrain: "LAND" }, 60_000)).toBeUndefined();
    expect(buildTileYieldView(settled(1, 1, { ownershipState: "FRONTIER" }), 60_000)).toBeUndefined();
  });

  describe("tileYieldNeedsServerAuthority predicate", () => {
    it("is false for an empty settled tile", () => {
      expect(tileYieldNeedsServerAuthority({})).toBe(false);
    });

    it("is true for a tile with a dockId", () => {
      expect(tileYieldNeedsServerAuthority({ dockId: "dock-a" })).toBe(true);
    });
  });
});
