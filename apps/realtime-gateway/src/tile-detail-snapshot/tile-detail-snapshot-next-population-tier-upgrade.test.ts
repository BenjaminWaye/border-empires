import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

describe("buildSnapshotTileDetail nextPopulationTierUpgrade", () => {
  // Regression: nextPopulationTierUpgrade (packages/shared/src/town-growth)
  // was computed correctly by the simulation (live-town-summary.ts) but,
  // like townModifierTotals, stripped by toSharedVisibilityTownSummary's
  // allowlist before persistence -- and this path never recomputed it fresh
  // the way it does for townModifierTotals/growthModifiers/etc. So the
  // town-upgrade-ready map badge (client-town-growth.ts) never saw
  // `available: true` for any eligible town, including the town's own owner.
  it("computes nextPopulationTierUpgrade for the tile-detail path, not just the persisted (redacted) townJson", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 400,
          y: 400,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          // Simulates the real persisted shape: toSharedVisibilityTownSummary
          // already stripped nextPopulationTierUpgrade out of this JSON
          // before it was written — the fix must not depend on it being
          // present here.
          townJson: JSON.stringify({ type: "MARKET", populationTier: "TOWN", population: 1_392_626 }),
          townType: "MARKET",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 400, 400);
    const town = detail?.townJson
      ? (JSON.parse(detail.townJson as string) as {
          nextPopulationTierUpgrade?: { targetTier: string; requiredPopulation: number; available: boolean };
        })
      : undefined;

    // Population (1,392,626) is well past CITY_POPULATION_MIN (100,000), so
    // a TOWN-tier town's next upgrade (to CITY) must be reported available.
    expect(town?.nextPopulationTierUpgrade).toBeDefined();
    expect(town?.nextPopulationTierUpgrade?.targetTier).toBe("CITY");
    expect(town?.nextPopulationTierUpgrade?.available).toBe(true);
  });

  it("does not report nextPopulationTierUpgrade as available below the next tier's population threshold", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 401,
          y: 401,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({ type: "MARKET", populationTier: "TOWN", population: 5_000 }),
          townType: "MARKET",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 401, 401);
    const town = detail?.townJson
      ? (JSON.parse(detail.townJson as string) as { nextPopulationTierUpgrade?: { available: boolean } })
      : undefined;

    expect(town?.nextPopulationTierUpgrade?.available).toBe(false);
  });
});
