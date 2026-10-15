import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { LONG_PEACE_GROWTH_MULT } from "@border-empires/game-domain";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// Town population-growth coverage for buildSnapshotTileDetail, moved out of
// tile-detail-snapshot.test.ts (over the repo's 500-line cap).
describe("buildSnapshotTileDetail — town growth", () => {
  it("recomputes positive population growth for a fed town when isFed is missing from a thin town record", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 8603,
        manpower: 1950,
        manpowerCap: 1950,
        incomePerMinute: 14.5,
        strategicResources: { FOOD: 321.5, TITANIUM: 81.5, CRYSTAL: 189.4, UMBRITE: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0.12, TITANIUM: 0.17, CRYSTAL: 0.4, UMBRITE: 0, SHARD: 0 },
        upkeepPerMinute: { food: 0.1, titanium: 0, umbrite: 0, crystal: 0,  gold: 0.04 },
        upkeepLastTick: { foodCoverage: 1 },
        developmentProcessLimit: 3,
        activeDevelopmentProcessCount: 0,
        pendingSettlements: [],
        techIds: [],
        domainIds: []
      },
      tiles: [
        {
          x: 29,
          y: 251,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          // isFed omitted (thin record) -- falls back to global food coverage.
          townJson: JSON.stringify({
            type: "FARMING",
            populationTier: "TOWN",
            supportCurrent: 5,
            supportMax: 5,
            goldPerMinute: 0,
            cap: 0,
            population: 19_699,
            maxPopulation: 100_000,
            populationGrowthPerMinute: 0,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            foodUpkeepPerMinute: 0.1,
            baseGoldPerMinute: 2
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        },
        { x: 28, y: 250, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 29, y: 250, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 30, y: 250, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 28, y: 251, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 30, y: 251, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 29, 251);
    expect(detail?.townJson).toBeTypeOf("string");
    const town = JSON.parse(String(detail?.townJson)) as {
      isFed: boolean;
      populationGrowthPerMinute: number;
      growthModifiers?: Array<{ label: string; deltaPerMinute: number }>;
    };

    expect(town.isFed).toBe(true);
    expect(town.populationGrowthPerMinute).toBeGreaterThan(0);
    // Long-peace delta is the share of growth the bonus adds, matching
    // buildTownSummary (live-town-summary.ts) — not the whole rate.
    expect(town.growthModifiers).toEqual([
      { label: "Long time peace", deltaPerMinute: Number((town.populationGrowthPerMinute * (1 - 1 / LONG_PEACE_GROWTH_MULT)).toFixed(4)) }
    ]);
  });
});
