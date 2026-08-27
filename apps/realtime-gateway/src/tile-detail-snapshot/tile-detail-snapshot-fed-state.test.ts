import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

// Split out of tile-detail-snapshot.test.ts (already well over the repo's
// 500-line soft cap) to keep that file from growing further -- see its own
// split-rationale comments (tile-detail-snapshot-mintworks-gold.test.ts,
// tile-detail-snapshot-converter-mode-upkeep.test.ts) for the same pattern.
describe("buildSnapshotTileDetail — isFed authority", () => {
  it("does not override a fresh isFed: false with the legacy foodCoverage/adjacent-food heuristics", () => {
    // Regression: a live recompute always writes a real isFed boolean onto
    // townJson (buildTownSummary, live-town-summary.ts), reflecting the
    // FOOD-slot dormancy engine's actual verdict for this town. The old code
    // only trusted `isFed === true`, so a fresh, correct `isFed: false` (a
    // real FOOD-slot shortfall -- e.g. a second town's demand pushing the
    // player's total FOOD demand over supply) looked identical to a thin/
    // missing record and got silently flipped back to true by
    // player.upkeepLastTick.foodCoverage (a legacy stockpile-coverage metric
    // that predates the FOOD-slot rewrite and is usually ~1 regardless of
    // slot shortfalls) and/or an adjacent FARM/FISH tile -- so a genuinely
    // unfed town could still report fed in the tile-detail popup.
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 100,
        manpower: 100,
        manpowerCap: 100,
        incomePerMinute: 0,
        strategicResources: { FOOD: 100, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
        upkeepPerMinute: { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 },
        // Legacy stockpile-coverage metric reads "fully covered" even though
        // this town's real FOOD-slot demand is short -- it must not win.
        upkeepLastTick: { foodCoverage: 1 },
        developmentProcessLimit: 3,
        activeDevelopmentProcessCount: 0,
        pendingSettlements: [],
        techIds: [],
        domainIds: []
      },
      tiles: [
        {
          x: 20,
          y: 20,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            type: "FARMING",
            populationTier: "TOWN",
            supportCurrent: 4,
            supportMax: 4,
            goldPerMinute: 0,
            cap: 0,
            isFed: false,
            population: 5000,
            maxPopulation: 25_000,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            foodUpkeepPerMinute: 0.1,
            baseGoldPerMinute: 2
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        },
        // Adjacent FARM tile -- the other legacy fallback -- must also not
        // override the sim's own fresh, authoritative isFed: false.
        { x: 21, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 20, 20);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as { isFed: boolean }) : undefined;
    expect(town?.isFed).toBe(false);
  });
});
