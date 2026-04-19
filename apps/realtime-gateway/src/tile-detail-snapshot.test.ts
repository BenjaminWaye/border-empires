import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";

import { buildSnapshotTileDetail } from "./tile-detail-snapshot.js";

describe("buildSnapshotTileDetail", () => {
  it("adds tile upkeep detail for owned settled tiles", () => {
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
            supportMax: 8,
            goldPerMinute: 2.2,
            cap: 1584,
            isFed: true,
            population: 18_977,
            maxPopulation: 25_000,
            connectedTownCount: 1,
            connectedTownBonus: 0.1,
            hasMarket: true,
            marketActive: true,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false,
            foodUpkeepPerMinute: 0.1,
            baseGoldPerMinute: 2
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        },
        {
          x: 10,
          y: 11,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          economicStructureJson: JSON.stringify({ type: "MARKET", status: "active" })
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);

    expect(detail).toEqual(
      expect.objectContaining({
        detailLevel: "full",
        upkeepEntries: expect.arrayContaining([
          { label: "Town", perMinute: { FOOD: 0.1 } },
          { label: "Settled land", perMinute: { GOLD: 0.04 } }
        ])
      })
    );
  });

  it("backfills yield rate and cap for owned settled tiles when the snapshot tile is thin", () => {
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
            populationTier: "SETTLEMENT",
            supportCurrent: 0,
            supportMax: 0,
            goldPerMinute: 0,
            cap: 0,
            isFed: true,
            population: 800,
            maxPopulation: 2500,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            baseGoldPerMinute: 0
          }),
          townType: "FARMING",
          townPopulationTier: "SETTLEMENT"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);

    expect(detail).toEqual(
      expect.objectContaining({
        detailLevel: "full",
        yieldRate: expect.objectContaining({ goldPerMinute: 1 }),
        yieldCap: expect.objectContaining({ gold: expect.any(Number) })
      })
    );
  });

  it("recomputes town support and fed state from surrounding settled tiles for thin town detail", () => {
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
            supportCurrent: 2,
            supportMax: 8,
            goldPerMinute: 0,
            cap: 0,
            isFed: false,
            population: 18_977,
            maxPopulation: 25_000,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            foodUpkeepPerMinute: 0.1,
            baseGoldPerMinute: 2
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        },
        { x: 9, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 9, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 9, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" },
        { x: 11, y: 11, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    expect(detail?.townJson).toBeTypeOf("string");
    const town = JSON.parse(String(detail?.townJson)) as {
      supportCurrent: number;
      supportMax: number;
      isFed: boolean;
      goldPerMinute: number;
    };

    expect(town.supportCurrent).toBe(8);
    expect(town.supportMax).toBe(8);
    expect(town.isFed).toBe(true);
    expect(town.goldPerMinute).toBe(2);
    expect(detail).toEqual(
      expect.objectContaining({
        yieldRate: expect.objectContaining({ goldPerMinute: 2 })
      })
    );
  });
});
