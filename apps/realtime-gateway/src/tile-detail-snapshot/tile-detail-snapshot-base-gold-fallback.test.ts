import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

describe("buildSnapshotTileDetail base gold fallback", () => {
  it("derives a missing baseGoldPerMinute from the rescaled constants, not the stale flat 2", () => {
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
            type: "FARMING",
            populationTier: "TOWN",
            supportCurrent: 4,
            supportMax: 7,
            isFed: true,
            population: 20_000,
            maxPopulation: 10_000_000,
            connectedTownCount: 1,
            connectedTownBonus: 0
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    const town = JSON.parse(String(detail?.townJson)) as { baseGoldPerMinute: number };

    expect(town.baseGoldPerMinute).toBeCloseTo(2 / 288, 6);
  });
});
