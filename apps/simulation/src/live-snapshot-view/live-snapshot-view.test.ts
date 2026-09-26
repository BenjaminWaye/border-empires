import { describe, expect, it } from "vitest";

import { enrichSnapshotTilesForGlobalVisibility } from "./live-snapshot-view.js";

const landTile = (x: number, y: number, ownerId?: string, structureType?: string) => ({
  x,
  y,
  terrain: "LAND" as const,
  ...(ownerId ? { ownerId, ownershipState: "SETTLED" } : {}),
  ...(structureType
    ? { economicStructureJson: JSON.stringify({ type: structureType, status: "active", ownerId }) }
    : {})
});

describe("enrichSnapshotTilesForGlobalVisibility", () => {
  it("does not expose owner-only town economy fields in shared full-visibility tiles", () => {
    const tiles = enrichSnapshotTilesForGlobalVisibility({
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "BlackFang",
            type: "MARKET",
            populationTier: "CITY",
            baseGoldPerMinute: 2,
            supportCurrent: 8,
            supportMax: 8,
            goldPerMinute: 2,
            cap: 20,
            isFed: true,
            population: 5,
            maxPopulation: 8,
            connectedTownCount: 1,
            connectedTownBonus: 0.2,
            hasMintworks: true,
            mintworksActive: true,
            hasGranary: false,
            granaryActive: false,
          }),
          townType: "MARKET",
          townName: "BlackFang",
          townPopulationTier: "CITY"
        },
        {
          x: 11,
          y: 10,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          townJson: JSON.stringify({
            name: "BrightFang",
            type: "FARMING",
            populationTier: "CITY",
            baseGoldPerMinute: 2,
            supportCurrent: 3,
            supportMax: 4,
            goldPerMinute: 5,
            cap: 20,
            isFed: true,
            population: 5,
            maxPopulation: 8,
            connectedTownCount: 0,
            connectedTownBonus: 0,
            hasMintworks: false,
            mintworksActive: false,
            hasGranary: false,
            granaryActive: false,
          }),
          townType: "FARMING",
          townName: "BrightFang",
          townPopulationTier: "CITY"
        },
        landTile(11, 11, "player-2", "CARAVANARY"),
        // Feeds the Caravanary's own FOOD slot demand so it isn't dormant.
        { x: 12, y: 12, terrain: "LAND" as const, resource: "FARM" as const, ownerId: "player-2", ownershipState: "SETTLED" as const }
      ],
      players: [
        {
          id: "player-2",
          name: "BlackFang",
          points: 5,
          manpower: 3,
          techIds: [],
          domainIds: [],
          strategicResources: { FOOD: 10, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 },
          allies: [],
          vision: 1,
          visionRadiusBonus: 0,
        }
      ],
      pendingSettlements: [],
      activeLocks: []
    });

    const town = JSON.parse(String(tiles[0]?.townJson));
    expect(town.name).toBe("BlackFang");
    expect(town.type).toBe("MARKET");
    expect(town.populationTier).toBe("CITY");
    expect(town).not.toHaveProperty("isFed");
    expect(town).not.toHaveProperty("supportCurrent");
    expect(town).not.toHaveProperty("supportMax");
    expect(town).not.toHaveProperty("hasMintworks");
    // yieldRate removed from tile export (see docs/plans/2026-05-30-bootstrap-payload-shrink.md).
    // goldPerMinute remains stripped from shared-visibility town summaries (by design).
    expect(town).not.toHaveProperty("goldPerMinute");
    expect(town.connectedTownCount).toBe(1);
    expect(town.connectedTownBonus).toBe(0.5);
  });

  it("gives no FOOD yield to a Farmstead FARM tile regardless of an active Waterworks in radius (§5.4: slot-based, not yield-based)", () => {
    const farmTile = {
      x: 5,
      y: 5,
      terrain: "LAND" as const,
      resource: "FARM",
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      economicStructureJson: JSON.stringify({ type: "FARMSTEAD", status: "active", ownerId: "player-1" })
    };
    const waterworksTile = {
      x: 10,
      y: 5,
      terrain: "LAND" as const,
      ownerId: "player-1",
      ownershipState: "SETTLED" as const,
      economicStructureJson: JSON.stringify({ type: "WATERWORKS", status: "active", ownerId: "player-1" })
    };
    const player = {
      id: "player-1",
      name: "player-1",
      points: 0,
      manpower: 0,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      allies: [],
      vision: 1,
      visionRadiusBonus: 0
    };
    const withoutWaterworks = enrichSnapshotTilesForGlobalVisibility({
      tiles: [farmTile],
      players: [player],
      pendingSettlements: [],
      activeLocks: []
    });
    const withWaterworks = enrichSnapshotTilesForGlobalVisibility({
      tiles: [farmTile, waterworksTile],
      players: [player],
      pendingSettlements: [],
      activeLocks: []
    });
    const baseFood = withoutWaterworks.find((t) => t.x === 5 && t.y === 5)?.yield?.strategic?.FOOD ?? 0;
    const boostedFood = withWaterworks.find((t) => t.x === 5 && t.y === 5)?.yield?.strategic?.FOOD ?? 0;
    // §5.4: FOOD is slot-based, not yield-based — no Farmstead/Waterworks
    // FOOD yield to boost anymore.
    expect(baseFood).toBe(0);
    expect(boostedFood).toBe(0);
  });

  it("emits yieldRate/yieldCap only for tiles that need server authority (strategic structure or dock), not for bare settled tiles", () => {
    const basePlayer = {
      id: "player-2",
      name: "player-2",
      points: 0,
      manpower: 0,
      techIds: [],
      domainIds: [],
      strategicResources: {},
      allies: [],
      vision: 1,
      visionRadiusBonus: 0
    };
    const tiles = enrichSnapshotTilesForGlobalVisibility({
      tiles: [
        // Bare settled resource tile — no structure, no dock: predicate is false.
        { x: 1, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", resource: "UMBRITE" },
        // Active FARMSTEAD — strategic-affecting structure: predicate is true.
        {
          x: 2,
          y: 1,
          terrain: "LAND",
          ownerId: "player-2",
          ownershipState: "SETTLED",
          resource: "FARM",
          economicStructureJson: JSON.stringify({ type: "FARMSTEAD", status: "active", ownerId: "player-2" })
        },
        // Dock tile — predicate is true regardless of structure.
        { x: 3, y: 1, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-a" }
      ],
      players: [basePlayer],
      pendingSettlements: [],
      activeLocks: []
    });

    const bare = tiles.find((t) => t.x === 1 && t.y === 1);
    const farmstead = tiles.find((t) => t.x === 2 && t.y === 1);
    const dock = tiles.find((t) => t.x === 3 && t.y === 1);

    expect(bare).not.toHaveProperty("yieldRate");
    expect(bare).not.toHaveProperty("yieldCap");
    expect(farmstead).toHaveProperty("yieldRate");
    // §5.4: FOOD is slot-based, not yield-based — no strategicPerDay.FOOD anymore.
    expect((farmstead as { yieldRate?: { strategicPerDay?: Record<string, number> } })?.yieldRate?.strategicPerDay?.FOOD).toBeUndefined();
    expect(dock).toHaveProperty("yieldRate");
  });
});
