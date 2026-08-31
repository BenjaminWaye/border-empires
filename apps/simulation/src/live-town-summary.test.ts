import { describe, expect, it } from "vitest";
import {
  GARRISON_HALL_MANPOWER_CAP_BONUS,
  MINTWORKS_FLAT_GOLD_BONUS_PER_MIN,
  MINTWORKS_GOLD_PRODUCTION_BONUS,
  percentLabel,
  TOWN_BASE_GOLD_PER_MIN
} from "@border-empires/game-domain";
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

describe("buildTownSummary — townModifierTotals (unified building modifier display, stage 3)", () => {
  it("sums a flat, additive-per-copy modifier (manpower cap) across every active Garrison Hall in the support ring, under a '<count> Garrison Halls' heading", () => {
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
      heading: "2 Garrison Halls",
      modifiers: [{ statLabel: "Manpower cap", valueText: `+${GARRISON_HALL_MANPOWER_CAP_BONUS * 2}`, tone: "positive" }]
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

  // Regression: Weapons Workshop and Titanium Weapons Factory used to be
  // merged into one combined, unlabeled "Empire attack" total. Each building
  // type now gets its own heading and its own total instead, so the panel
  // always shows which building a number came from.
  it("gives Weapons Workshop and Titanium Weapons Factory separate headings/totals for Empire attack", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [
      town,
      supportTile(11, 10, ownerId, "WEAPONS_WORKSHOP"),
      supportTile(9, 10, ownerId, "TITANIUM_WEAPONS_FACTORY")
    ];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    const workshopPercent = WEAPONS_WORKSHOP_ATTACK_MULT_PER_BUILDING * 100;
    const factoryPercent = TITANIUM_WEAPONS_FACTORY_ATTACK_MULT_PER_BUILDING * 100;
    expect(summary?.townModifierTotals).toContainEqual({
      heading: "1 Weapons Workshop",
      modifiers: expect.arrayContaining([{ statLabel: "Empire attack", valueText: percentLabel(workshopPercent), tone: "positive" }])
    });
    expect(summary?.townModifierTotals).toContainEqual({
      heading: "1 Titanium Weapons Factory",
      modifiers: expect.arrayContaining([{ statLabel: "Empire attack", valueText: percentLabel(factoryPercent), tone: "positive" }])
    });
  });

  it("aggregates Mintworks gold production non-linearly (via the live count) instead of a naive per-copy multiply, under a '<count> Mintworks' heading", () => {
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
      heading: "3 Mintworks",
      modifiers: expect.arrayContaining([{ statLabel: "Gold production", valueText: percentLabel(expectedPercent), tone: "positive" }])
    });
  });
});

// Mintworks-style town attribution: an EXCHANGE-mode converter (Aether
// Condenser/Titanium Works/Umbrite Works) in a town's support ring folds its
// gold into that town's own production and surfaces a "Sell Off gold"
// modifier under a "<count> <Building>" heading, exactly like Mintworks.
describe("buildTownSummary — converter town-support attribution", () => {
  const converterSupportTile = (x: number, y: number, ownerId: string, type: string, converterMode?: string): FixtureTile => ({
    x,
    y,
    terrain: "LAND",
    ownerId,
    ownershipState: "SETTLED",
    economicStructureJson: JSON.stringify({ type, status: "active", ownerId, ...(converterMode ? { converterMode } : {}) })
  });

  it("folds an EXCHANGE-mode Aether Condenser's gold into the town's goldPerMinute", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [town, converterSupportTile(11, 10, ownerId, "CRYSTAL_SYNTHESIZER", "EXCHANGE")];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const fedTownKeys = new Set([keyFor(10, 10)]);
    const withoutConverter = buildTownSummary(town as never, undefined, new Map([[keyFor(10, 10), town as never]]), fedTownKeys, true);
    const withConverter = buildTownSummary(town as never, undefined, tilesByKey, fedTownKeys, true);
    expect(withConverter?.goldPerMinute).toBeCloseTo((withoutConverter?.goldPerMinute ?? 0) + 10 / 1440, 3);
  });

  it("surfaces a 'Sell Off gold' modifier under a '1 Aether Condenser' heading", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [town, converterSupportTile(11, 10, ownerId, "CRYSTAL_SYNTHESIZER", "EXCHANGE")];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    expect(summary?.townModifierTotals).toContainEqual({
      heading: "1 Aether Condenser",
      modifiers: [{ statLabel: "Sell Off gold", valueText: "+10", tone: "positive" }]
    });
  });

  it("does not attribute a REFINE-mode (default) converter's gold to the town — it produces no gold at all", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [town, converterSupportTile(11, 10, ownerId, "CRYSTAL_SYNTHESIZER")];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const summary = buildTownSummary(town as never, undefined, tilesByKey, new Set(), true);
    expect(summary?.townModifierTotals ?? []).toEqual([]);
  });
});

describe("buildTownSummary — goldPerMinute", () => {
  // Regression test: this formula used to duplicate townGoldPerMinuteForPlayer
  // (player-update-economy.ts) without its trailing "+ MINTWORKS_FLAT_GOLD_BONUS_PER_MIN
  // * mintworksCount" term — each Mintworks' own flat +1 gold/day-per-copy
  // bonus (separate from its % production multiplier) silently never showed
  // up in a town's displayed gold production. Exactly the "duplicate-logic
  // risk this codebase has hit before" this file's own comments elsewhere
  // warn about.
  it("includes each active Mintworks' flat gold/min bonus, not just its % production multiplier", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [
      town,
      supportTile(11, 10, ownerId, "MINTWORKS"),
      supportTile(9, 10, ownerId)
    ];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const fedTownKeys = new Set([keyFor(10, 10)]);
    const summary = buildTownSummary(town as never, undefined, tilesByKey, fedTownKeys, true);
    const expectedGoldPerMinute =
      TOWN_BASE_GOLD_PER_MIN * (1 + MINTWORKS_GOLD_PRODUCTION_BONUS) + MINTWORKS_FLAT_GOLD_BONUS_PER_MIN;
    // buildTownSummary rounds goldPerMinute before returning it — compare
    // at reduced precision rather than exact float equality.
    expect(summary?.goldPerMinute).toBeCloseTo(expectedGoldPerMinute, 4);
  });
});

describe("buildTownSummary — firstThreeTown wire fields", () => {
  // Regression: Mercantile Charter's firstThreeTownsGoldOutputMult/
  // firstThreeTownsPopulationGrowthMult were already folded into
  // goldPerMinute/populationGrowthPerMinute, but never put on the returned
  // town object itself — the tile overview's modifier list had no field to
  // read, so the bonus applied invisibly with no on-screen indication.
  it("includes firstThreeTownGoldMult/firstThreeTownPopGrowthMult when the town is one of the owner's first three and they hold Mercantile Charter", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [town, supportTile(11, 10, ownerId)];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const fedTownKeys = new Set([keyFor(10, 10)]);
    const firstThreeTownKeys = new Set([keyFor(10, 10)]);
    const player = { id: ownerId, techIds: new Set<string>(), domainIds: new Set(["mercantile-charter"]) };
    const summary = buildTownSummary(town as never, player as never, tilesByKey, fedTownKeys, true, undefined, firstThreeTownKeys);
    expect(summary?.firstThreeTownGoldMult).toBeCloseTo(1.5, 5);
    expect(summary?.firstThreeTownPopGrowthMult).toBeCloseTo(1.25, 5);
  });

  it("omits firstThreeTownGoldMult/firstThreeTownPopGrowthMult when the town isn't in the owner's first three", () => {
    const ownerId = "p1";
    const town = townTile(10, 10, ownerId);
    const tiles: FixtureTile[] = [town, supportTile(11, 10, ownerId)];
    const tilesByKey = new Map(tiles.map((t) => [keyFor(t.x, t.y), t as never]));
    const fedTownKeys = new Set([keyFor(10, 10)]);
    const player = { id: ownerId, techIds: new Set<string>(), domainIds: new Set(["mercantile-charter"]) };
    const summary = buildTownSummary(town as never, player as never, tilesByKey, fedTownKeys, true, undefined, new Set());
    expect(summary?.firstThreeTownGoldMult).toBeUndefined();
    expect(summary?.firstThreeTownPopGrowthMult).toBeUndefined();
  });
});
