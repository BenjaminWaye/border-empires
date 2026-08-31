import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { WORLD_WIDTH } from "@border-empires/shared";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// Regression for the bug reported after PR #1712: the gateway's tile-detail
// RPC (exportTilesInAreaForPlayer -> buildSnapshotTileDetail) never surfaced
// Mercantile Charter's gold/growth bonus at all — firstThreeTownGoldMult/
// firstThreeTownPopGrowthMult are stripped from the persisted townJson by
// toSharedVisibilityTownSummary's allowlist, and this file's fallback
// recompute never called firstThreeTownMultipliersForTile in the first
// place, so the bonus was invisible on this path regardless.
describe("buildSnapshotTileDetail — Mercantile Charter (first three towns)", () => {
  it("surfaces firstThreeTownGoldMult/firstThreeTownPopGrowthMult for one of the player's first three towns", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 0,
        manpower: 0,
        manpowerCap: 0,
        incomePerMinute: 0,
        strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        developmentProcessLimit: 0,
        activeDevelopmentProcessCount: 0,
        pendingSettlements: [],
        techIds: [],
        domainIds: ["mercantile-charter"]
      } as unknown as PlayerSubscriptionSnapshot["player"],
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Firstville",
            type: "MARKET",
            populationTier: "TOWN",
            isFed: true,
            population: 20000,
            maxPopulation: 10_000_000,
            connectedTownCount: 0,
            connectedTownBonus: 0
            // goldPerMinute/populationGrowthPerMinute intentionally absent so
            // the fallback recompute path (the one this bug lives in) runs.
          }),
          townType: "MARKET",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town).toBeDefined();
    // mercantile-charter grants firstThreeTownsGoldOutputMult: 1.5 and
    // firstThreeTownsPopulationGrowthMult: 1.25 (domain-tree.json). Before
    // the fix neither field was ever computed on this path, so both were
    // always absent regardless of the player's domains/tech.
    expect(town?.firstThreeTownGoldMult).toBe(1.5);
    expect(town?.firstThreeTownPopGrowthMult).toBe(1.25);
  });

  it("omits the fields for a town that isn't one of the player's first three (or the player has no bonus)", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Firstville",
            type: "MARKET",
            populationTier: "TOWN",
            isFed: true,
            population: 20000,
            maxPopulation: 10_000_000,
            connectedTownCount: 0,
            connectedTownBonus: 0
          }),
          townType: "MARKET",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town).toBeDefined();
    expect(town?.firstThreeTownGoldMult).toBeUndefined();
    expect(town?.firstThreeTownPopGrowthMult).toBeUndefined();
  });
});

// Regression for the bug reported after PR #1712: a town on the map's east
// edge has a support-ring neighbor that only exists via horizontal
// wraparound (x = WORLD_WIDTH - 1's east neighbor is x = 0), but this file's
// local keyFor built plain "x,y" keys instead of wrapping, so a Mintworks
// built on the wrapped tile was silently never counted for the edge town.
describe("buildSnapshotTileDetail — support ring wraps at the map's x edge", () => {
  it("counts a Mintworks on a support tile reachable only via wraparound", () => {
    const edgeX = WORLD_WIDTH - 1;
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: edgeX,
          y: 48,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Brynmarch Sound",
            type: "MARKET",
            populationTier: "CITY",
            isFed: true,
            population: 20000,
            maxPopulation: 10_000_000,
            connectedTownCount: 0,
            connectedTownBonus: 0
          }),
          townType: "MARKET",
          townPopulationTier: "CITY"
        },
        // East neighbor of x = WORLD_WIDTH - 1 wraps to x = 0.
        {
          x: 0,
          y: 48,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "MINTWORKS", status: "active" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", edgeX, 48);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town).toBeDefined();
    expect(town?.hasMintworks).toBe(true);
    expect(town?.mintworksCount).toBe(1);
  });
});
