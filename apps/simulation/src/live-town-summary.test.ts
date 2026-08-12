import { describe, expect, it } from "vitest";
import { GARRISON_HALL_MANPOWER_CAP_BONUS } from "@border-empires/game-domain";
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
});
