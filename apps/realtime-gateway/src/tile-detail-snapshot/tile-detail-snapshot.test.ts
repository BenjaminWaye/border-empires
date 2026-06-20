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

  it("derives town food upkeep from populationTier when townJson lacks foodUpkeepPerMinute", () => {
    // Regression: before the fix, the town food-upkeep entry only appeared when
    // townJson carried foodUpkeepPerMinute. Thin snapshots that omitted the
    // field silently dropped the Town line from tile-detail upkeep.
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
            populationTier: "CITY",
            supportCurrent: 4,
            supportMax: 8,
            goldPerMinute: 4.0,
            cap: 1920,
            isFed: true,
            population: 50_000,
            maxPopulation: 100_000,
            connectedTownCount: 1,
            connectedTownBonus: 0.1,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false,
            // foodUpkeepPerMinute intentionally omitted - the regression shape.
            baseGoldPerMinute: 2
          }),
          townType: "FARMING",
          townPopulationTier: "CITY"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);

    expect(detail).toEqual(
      expect.objectContaining({
        detailLevel: "full",
        upkeepEntries: expect.arrayContaining([
          { label: "Town", perMinute: { FOOD: 0.3 } },
          { label: "Settled land", perMinute: { GOLD: 0.04 } }
        ])
      })
    );
  });

  it("derives town food upkeep from tile town fields when townJson is missing", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townType: "FARMING",
          townPopulationTier: "GREAT_CITY"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);

    expect(detail).toEqual(
      expect.objectContaining({
        detailLevel: "full",
        upkeepEntries: expect.arrayContaining([
          { label: "Town", perMinute: { FOOD: 0.6 } },
          { label: "Settled land", perMinute: { GOLD: 0.04 } }
        ])
      })
    );
    expect(JSON.parse(detail?.townJson ?? "{}")).toEqual(
      expect.objectContaining({
        populationTier: "GREAT_CITY",
        foodUpkeepPerMinute: 0.6
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

  it("does not add a town food upkeep entry for settlements", () => {
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
            goldPerMinute: 1,
            cap: 480,
            isFed: true,
            population: 900,
            maxPopulation: 2_500,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false,
            foodUpkeepPerMinute: 0,
            baseGoldPerMinute: 1
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
        upkeepEntries: [{ label: "Settled land", perMinute: { GOLD: 0.04 } }]
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
    expect(town.goldPerMinute).toBe(0);
    expect(detail).toEqual(
      expect.objectContaining({
        yieldRate: expect.objectContaining({ goldPerMinute: 0 })
      })
    );
  });

  it("keeps a town fed when global food coverage is full even without adjacent food", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 8603,
        manpower: 1950,
        manpowerCap: 1950,
        incomePerMinute: 14.5,
        strategicResources: { FOOD: 321.5, IRON: 81.5, CRYSTAL: 189.4, SUPPLY: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0.12, IRON: 0.17, CRYSTAL: 0.4, SUPPLY: 0, SHARD: 0 },
        upkeepPerMinute: { food: 0.1, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0.04 },
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
          townJson: JSON.stringify({
            type: "FARMING",
            populationTier: "TOWN",
            supportCurrent: 4,
            supportMax: 4,
            goldPerMinute: 0,
            cap: 0,
            isFed: false,
            population: 21_277,
            maxPopulation: 25_000,
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
        { x: 28, y: 251, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 30, y: 251, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 29, 251);
    expect(detail?.townJson).toBeTypeOf("string");
    const town = JSON.parse(String(detail?.townJson)) as {
      isFed: boolean;
      goldPerMinute: number;
    };

    expect(town.isFed).toBe(true);
    expect(town.goldPerMinute).toBe(0);
    expect(detail).toEqual(
      expect.objectContaining({
        yieldRate: expect.objectContaining({ goldPerMinute: 0 })
      })
    );
  });

  it("recomputes positive population growth for fed owned town detail when cached town data is stale", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 8603,
        manpower: 1950,
        manpowerCap: 1950,
        incomePerMinute: 14.5,
        strategicResources: { FOOD: 321.5, IRON: 81.5, CRYSTAL: 189.4, SUPPLY: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0.12, IRON: 0.17, CRYSTAL: 0.4, SUPPLY: 0, SHARD: 0 },
        upkeepPerMinute: { food: 0.1, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0.04 },
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
          townJson: JSON.stringify({
            type: "FARMING",
            populationTier: "TOWN",
            supportCurrent: 5,
            supportMax: 5,
            goldPerMinute: 0,
            cap: 0,
            isFed: false,
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
    expect(town.growthModifiers).toEqual([
      { label: "Long time peace", deltaPerMinute: town.populationGrowthPerMinute }
    ]);
  });

  it("preserves the sim's authoritative goldPerMinute and cap (does not silently re-derive with the stripped-down local formula)", () => {
    // Repro for the prod bug where the inspector showed "Production: 2.00/m"
    // with cap 960 on a town that actually had 3 connected towns (+120%): the
    // sim correctly shipped townJson with goldPerMinute=4.4 and cap=2112, but
    // buildSnapshotTileDetail recomputed gpm from baseGoldPerMinute * support *
    // marketMult * bankMult — a formula missing connectedTownBonus, popMult,
    // firstThreeTownMult, incomeMult, PASSIVE_INCOME_MULT, and the +1 bank
    // flat. That stripped value clobbered the sim's authoritative one on its
    // way to the client.
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
            name: "Gloamspire",
            type: "FARMING",
            populationTier: "TOWN",
            baseGoldPerMinute: 2,
            supportCurrent: 8,
            supportMax: 8,
            // Sim's authoritative values with bonus + popMult applied.
            goldPerMinute: 4.4,
            cap: 2112,
            isFed: true,
            population: 17669,
            maxPopulation: 10_000_000,
            connectedTownCount: 3,
            connectedTownBonus: 1.2,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town).toBeDefined();
    // The whole point of the fix: the sim's values must survive end-to-end.
    expect(town?.goldPerMinute).toBeCloseTo(4.4, 4);
    expect(town?.cap).toBeCloseTo(2112, 0);
    expect(detail).toEqual(
      expect.objectContaining({
        yieldRate: expect.objectContaining({ goldPerMinute: 4.4 }),
        yieldCap: expect.objectContaining({ gold: 2112 })
      })
    );
  });

  it("preserves sim production and cap even when cached fed state disagrees with gateway-derived fed state", () => {
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      player: {
        id: "player-1",
        gold: 8603,
        manpower: 1950,
        manpowerCap: 1950,
        incomePerMinute: 14.5,
        strategicResources: { FOOD: 321.5, IRON: 81.5, CRYSTAL: 189.4, SUPPLY: 0, SHARD: 0 },
        strategicProductionPerMinute: { FOOD: 0.12, IRON: 0.17, CRYSTAL: 0.4, SUPPLY: 0, SHARD: 0 },
        upkeepPerMinute: { food: 0.1, iron: 0, supply: 0, crystal: 0, oil: 0, gold: 0.04 },
        upkeepLastTick: { foodCoverage: 1 },
        developmentProcessLimit: 3,
        activeDevelopmentProcessCount: 0,
        pendingSettlements: [],
        techIds: [],
        domainIds: []
      },
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Gloamspire",
            type: "FARMING",
            populationTier: "TOWN",
            baseGoldPerMinute: 2,
            supportCurrent: 8,
            supportMax: 8,
            goldPerMinute: 4.4,
            cap: 2112,
            isFed: false,
            population: 17669,
            maxPopulation: 10_000_000,
            connectedTownCount: 3,
            connectedTownBonus: 1.2,
            hasMarket: false,
            marketActive: false,
            hasGranary: false,
            granaryActive: false,
            hasBank: false,
            bankActive: false
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 10, 10);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;

    expect(town).toEqual(
      expect.objectContaining({
        isFed: true,
        goldPerMinute: 4.4,
        cap: 2112
      })
    );
    expect(detail).toEqual(
      expect.objectContaining({
        yieldRate: expect.objectContaining({ goldPerMinute: 4.4 }),
        yieldCap: expect.objectContaining({ gold: 2112 })
      })
    );
  });

  it("does not backfill cap=0 for an unfed TOWN when the snapshot also lacks cap", () => {
    // Unfed TOWN-tier with no goldPerMinute / cap on the snapshot: gpm correctly
    // falls back to 0, but cap must stay omitted so buildTileYieldView's default
    // TILE_YIELD_CAP_GOLD (=24) takes over for the stored-yield buffer ceiling.
    // Hard-coding cap=0 here would clobber that fallback and break offline yield
    // accumulation once the town becomes fed again.
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 50,
          y: 50,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            type: "FARMING",
            populationTier: "TOWN",
            baseGoldPerMinute: 2,
            supportCurrent: 2,
            supportMax: 8,
            isFed: false,
            population: 9000,
            maxPopulation: 25_000,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            foodUpkeepPerMinute: 0.1
          }),
          townType: "FARMING",
          townPopulationTier: "TOWN"
        }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 50, 50);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town?.goldPerMinute).toBe(0);
    // cap must NOT be present on town — otherwise the buffer cap is clobbered to 0.
    expect(town && "cap" in town).toBe(false);
    // yieldCap should reflect the default TILE_YIELD_CAP_GOLD (24), not 0.
    expect(detail).toEqual(
      expect.objectContaining({
        yieldCap: expect.objectContaining({ gold: 24 })
      })
    );
  });

  it("backfills goldPerMinute when the snapshot's townJson lacks the field (prod-zero regression)", () => {
    // Repro for the bug where a TOWN-tier town's tile detail showed
    // Production: 0/m even though baseGoldPerMinute=2 and connectedTownBonus=1.2
    // were both present. Cause: the snapshot path produced a townJson without
    // `goldPerMinute`, and buildSnapshotTileDetail then forwarded that gap to
    // buildTileYieldView — which, with no economyContext, returns 0 for TOWN-
    // tier. Expected gpm here: 2 * 1 * (1 + 1.2) * 1 * 1 * 1 = 4.4.
    const snapshot: PlayerSubscriptionSnapshot = {
      playerId: "player-1",
      tiles: [
        {
          x: 241,
          y: 150,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "Velorreach",
            type: "MARKET",
            populationTier: "TOWN",
            baseGoldPerMinute: 2,
            supportCurrent: 5,
            supportMax: 5,
            // goldPerMinute / cap intentionally absent — this is the bug shape.
            isFed: true,
            population: 20671,
            maxPopulation: 10_000_000,
            connectedTownCount: 3,
            connectedTownBonus: 1.2,
            connectedTownNames: ["Gloamspire", "Sablemanor", "Velramanor"]
          }),
          townType: "MARKET",
          townPopulationTier: "TOWN"
        },
        // Five neighbor settled tiles so supportSummary reads 5/5.
        { x: 240, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 241, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 242, y: 149, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 240, y: 150, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 242, y: 150, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FARM" }
      ]
    };

    const detail = buildSnapshotTileDetail(snapshot, "player-1", 241, 150);
    const town = detail?.townJson ? (JSON.parse(detail.townJson as string) as Record<string, unknown>) : undefined;
    expect(town).toBeDefined();
    expect(town?.goldPerMinute).toBeCloseTo(4.4, 4);
    expect(town?.cap).toBeCloseTo(2112, 0);
    expect(detail).toEqual(
      expect.objectContaining({
        yieldRate: expect.objectContaining({ goldPerMinute: 4.4 }),
        yieldCap: expect.objectContaining({ gold: 2112 })
      })
    );
  });
});
