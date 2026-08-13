import { describe, expect, it } from "vitest";
import { GARRISON_HALL_MANPOWER_CAP_BONUS, MINTWORKS_GOLD_PRODUCTION_BONUS, percentLabel } from "@border-empires/game-domain";
import { TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING, WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING } from "@border-empires/shared";
import { buildTownSummary } from "./live-town-summary.js";
import { keyFor } from "./snapshot-tile-cache.js";

type FixtureTile = Record<string, unknown> & { x: number; y: number };

const townTile = (x: number, y: number, ownerId: string): FixtureTile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  townType: "MARKET",
  townPopulationTier: "TOWN",
  townJson: JSON.stringify({ type: "MARKET", populationTier: "TOWN", population: 20_000, maxPopulation: 100_000 })
});

const supportTile = (x: number, y: number, ownerId: string, structureType?: string): FixtureTile => ({
  x,
  y,
  terrain: "LAND",
  ownerId,
  ownershipState: "SETTLED",
  ...(structureType ? { economicStructureJson: JSON.stringify({ type: structureType, status: "active", ownerId }) } : {})
});

describe("buildTownSummary — townModifierTotals (unified building modifier display, stage 2)", () => {
  it("sums a flat, additive-per-copy modifier (manpower cap) across every active Garrison Hall in the support ring", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [
      town,
      supportTile(11, 10, ownerId, "GARRISON_HALL"),
      supportTile(9, 10, ownerId, "GARRISON_HALL"),
      supportTile(10, 11, ownerId)
    ];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    expect(summary?.townModifierTotals).toContainEqual({
      statLabel: "Manpower cap",
      total: GARRISON_HALL_MANPOWER_CAP_BONUS * 2,
      valueText: `+${GARRISON_HALL_MANPOWER_CAP_BONUS * 2}`,
      tone: "positive"
    });
  });

  it("omits townModifierTotals when no aggregate-eligible support buildings are present", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [town, supportTile(11, 10, ownerId)];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    expect(summary?.townModifierTotals ?? []).toEqual([]);
  });

  it("combines Weapons Workshop and Titanium Weapons Factory into one percent 'Empire attack' total", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [
      town,
      supportTile(11, 10, ownerId, "WEAPONS_WORKSHOP"),
      supportTile(9, 10, ownerId, "TITANIUM_WEAPONS_FACTORY")
    ];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    const expectedPercent = (WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING + TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING) * 100;
    expect(summary?.townModifierTotals).toContainEqual({
      statLabel: "Empire attack",
      total: expectedPercent,
      valueText: percentLabel(expectedPercent),
      tone: "positive"
    });
  });

  it("aggregates Mintworks gold production non-linearly (via the live count) instead of a naive per-copy multiply", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [
      town,
      supportTile(11, 10, ownerId, "MINTWORKS"),
      supportTile(9, 10, ownerId, "MINTWORKS"),
      supportTile(10, 11, ownerId, "MINTWORKS")
    ];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    const expectedPercent = MINTWORKS_GOLD_PRODUCTION_BONUS * 100 * 3;
    expect(summary?.townModifierTotals).toContainEqual({
      statLabel: "Gold production",
      total: expectedPercent,
      valueText: percentLabel(expectedPercent),
      tone: "positive"
    });
  });
});
