import { describe, expect, it } from "vitest";
import { chooseRefineryField } from "@border-empires/shared";
import { chooseBestEconomicBuild, type StructurePlannerPlayer, type StructurePlannerTile } from "../structure-command-planner.js";
import { boosterBuildScore, chooseRefineryBuild, refineryBuildScore, type RefineryBuildContext } from "./refinery-build-planner.js";
import { AI, at, placeStructure, plannerRefineryMap } from "./refinery-planner-test-map.js";

// Town T at (21,21) with an open TOWN-tier ring (radius 1). Titanium field
// A = (23,21)-(24,21), two land steps from the town.
const ROWS = [
  "...........",
  ".T.tt......",
  "..........."
];

const player = (overrides: Partial<StructurePlannerPlayer> = {}): StructurePlannerPlayer => ({
  id: AI,
  points: 10_000,
  manpower: 10_000,
  techIds: ["mining"],
  slotSupplyByResource: { FOOD: 10, TITANIUM: 2, UMBRITE: 0, CRYSTAL: 0 },
  slotDemandByResource: { FOOD: 0, TITANIUM: 2, UMBRITE: 0, CRYSTAL: 0 },
  ...overrides
});

const choose = (tiles: Map<string, StructurePlannerTile>, who = player()) => {
  const all = [...tiles.values()];
  return chooseBestEconomicBuild(who, all.filter((tile) => tile.ownerId === AI), tiles, all.filter((tile) => tile.ownerId === AI));
};

describe("AI refinery builds (chooseBestEconomicBuild)", () => {
  it("builds the matching refinery on a free ring tile of the town, naming a field the server accepts", () => {
    const tiles = plannerRefineryMap(ROWS);
    const choice = choose(tiles);
    expect(choice).toMatchObject({ structureType: "TITANIUM_REFINERY", tile: at(0, 0), field: at(3, 1) });
    // 36 + 2 tiles x 14 + 60 (TITANIUM in deficit) - 2 land steps x 2.
    expect(choice?.score).toBe(120);
    const validated = chooseRefineryField(tiles as never, AI, "TITANIUM_REFINERY", "21,21", new Set(), choice!.field);
    expect(validated.ok).toBe(true);
  });

  it("does not build when the town has no free ring tile", () => {
    const tiles = plannerRefineryMap(ROWS);
    for (const [column, row] of [[0, 0], [1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]] as const) {
      placeStructure(tiles, column, row, { type: "HYDROWORKS" });
    }
    expect(choose(tiles)?.structureType).not.toBe("TITANIUM_REFINERY");
  });

  it("does not build for a field beyond the 10-land-tile reach", () => {
    const tiles = plannerRefineryMap(["..............", ".T..........tt", ".............."]);
    expect(choose(tiles)).toBeUndefined();
  });

  it("does not build for a field the AI's land does not link", () => {
    const tiles = plannerRefineryMap(["..._.......", ".T._tt.....", "..._......."]);
    expect(choose(tiles)).toBeUndefined();
  });

  it("does not build a second refinery for a field one of its refineries already holds", () => {
    const tiles = plannerRefineryMap(ROWS);
    placeStructure(tiles, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(3, 1), assignedAt: 1 } });
    expect(choose(tiles)?.structureType).not.toBe("TITANIUM_REFINERY");
  });

  it("does not build without the refinery's tech", () => {
    expect(choose(plannerRefineryMap(ROWS), player({ techIds: [] }))).toBeUndefined();
    // Umbrite refineries need leatherworking, not mining.
    const umbrite = plannerRefineryMap(["...........", ".T.uu......", "..........."]);
    expect(choose(umbrite)).toBeUndefined();
    expect(choose(umbrite, player({ techIds: ["leatherworking"] }))?.structureType).toBe("UMBRITE_REFINERY");
  });

  it("does not build without a free FOOD slot, or when the output would only feed a surplus", () => {
    expect(choose(plannerRefineryMap(ROWS), player({ slotDemandByResource: { FOOD: 10, TITANIUM: 2 } }))).toBeUndefined();
    // 20 free + 4 new slots reaches the surplus food relief switches off (24).
    expect(choose(plannerRefineryMap(ROWS), player({ slotSupplyByResource: { FOOD: 10, TITANIUM: 22 } }))).toBeUndefined();
  });

  it("only counts garrisoned field tiles and prefers the larger garrisoned field", () => {
    // Field B (5..7) has three SETTLED tiles, field A (2..3) one SETTLED + one FRONTIER.
    const tiles = plannerRefineryMap(["..........", ".Ttr.ttt..", ".........."]);
    const choice = choose(tiles);
    expect(choice?.field).toEqual(at(5, 1));
    expect(refineryBuildScore(1, 0, 1)).toBeLessThan(refineryBuildScore(3, 0, 4)!);
  });
});

describe("refinery ring scarcity (chooseRefineryBuild)", () => {
  // Only (20,20) of the ring is open.
  const scarce = (): Map<string, StructurePlannerTile> => {
    const tiles = plannerRefineryMap(ROWS);
    for (const [column, row] of [[1, 0], [2, 0], [0, 1], [2, 1], [0, 2], [1, 2], [2, 2]] as const) placeStructure(tiles, column, row, { type: "HYDROWORKS" });
    return tiles;
  };
  const context = (tiles: Map<string, StructurePlannerTile>, competing: number): RefineryBuildContext<StructurePlannerTile> => ({
    playerId: AI, tilesByKey: tiles, candidateTiles: [...tiles.values()],
    slotSupply: { TITANIUM: 2 }, slotDemand: { TITANIUM: 2 },
    affordable: (type) => type === "TITANIUM_REFINERY", competingSupportScore: () => competing
  });

  it("leaves a town's last free ring tile to a building the economic scoring values more", () => {
    expect(chooseRefineryBuild(context(scarce(), 150))).toBeUndefined();
    expect(chooseRefineryBuild(context(scarce(), 60))).toMatchObject({ structureType: "TITANIUM_REFINERY", tile: at(0, 0) });
  });

  it("does not consult the competing score while more than one ring tile is free", () => {
    expect(chooseRefineryBuild(context(plannerRefineryMap(ROWS), 500))?.structureType).toBe("TITANIUM_REFINERY");
  });
});

describe("AI refinery boosters", () => {
  const boosterPlayer = player({ techIds: ["mining", "industrial-extraction"] });

  it("builds the booster in a town whose working refinery processes at least two tiles", () => {
    const tiles = plannerRefineryMap(ROWS);
    placeStructure(tiles, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(3, 1), assignedAt: 1 } });
    // 24 + 2 processed tiles x 10 + 60 deficit bonus.
    expect(choose(tiles, boosterPlayer)).toMatchObject({ structureType: "TITANIUM_SMELTER", tile: at(1, 1), score: 104 });
    expect(choose(tiles, boosterPlayer)?.field).toBeUndefined();
  });

  it("skips the booster below the processed-tile threshold, for an idle refinery, or when the town has one", () => {
    const small = plannerRefineryMap(["...........", ".T.t.......", "..........."]);
    placeStructure(small, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(3, 1), assignedAt: 1 } });
    expect(choose(small, boosterPlayer)).toBeUndefined();

    const building = plannerRefineryMap(ROWS);
    placeStructure(building, 0, 0, { type: "TITANIUM_REFINERY", status: "under_construction", refineryField: { ...at(3, 1), assignedAt: 1 } });
    expect(choose(building, boosterPlayer)).toBeUndefined();

    const boosted = plannerRefineryMap(ROWS);
    placeStructure(boosted, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(3, 1), assignedAt: 1 } });
    placeStructure(boosted, 2, 2, { type: "TITANIUM_SMELTER", status: "under_construction" });
    expect(choose(boosted, boosterPlayer)).toBeUndefined();
  });

  it("scores by processed tiles", () => {
    expect(boosterBuildScore(1, 0)).toBeUndefined();
    expect(boosterBuildScore(4, 5)).toBe(24 + 40);
  });
});

describe("refinery planning stays bounded (AI CPU guardrails)", () => {
  // An all-owned square with a titanium deposit every 6 tiles and one town in
  // the corner: tile reads must not grow with the territory.
  const world = (size: number) => {
    const tiles = new Map<string, StructurePlannerTile>();
    let reads = 0;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const tile: StructurePlannerTile = { x: 20 + x, y: 20 + y, terrain: "LAND", ownerId: AI, ownershipState: "SETTLED" };
      if (x === 1 && y === 1) tile.town = { populationTier: "TOWN" };
      else if (x % 6 === 4 && y % 6 === 4) tile.resource = "TITANIUM";
      tiles.set(`${tile.x},${tile.y}`, tile);
    }
    const counted = new Proxy(tiles, {
      get: (target, property) => property === "get"
        ? (key: string) => { reads += 1; return target.get(key); }
        : (() => { const value: unknown = Reflect.get(target, property, target); return typeof value === "function" ? value.bind(target) : value; })()
    }) as Map<string, StructurePlannerTile>;
    const context: RefineryBuildContext<StructurePlannerTile> = {
      playerId: AI, tilesByKey: counted, candidateTiles: [...tiles.values()],
      affordable: (type) => type === "TITANIUM_REFINERY" || type === "TITANIUM_SMELTER", competingSupportScore: () => 0
    };
    return { context, reads: () => reads };
  };

  it("reads a fixed neighbourhood of the towns however large the territory is", () => {
    const small = world(40);
    expect(chooseRefineryBuild(small.context)?.structureType).toBe("TITANIUM_REFINERY");
    const large = world(120);
    expect(chooseRefineryBuild(large.context)?.structureType).toBe("TITANIUM_REFINERY");
    expect(large.reads()).toBe(small.reads());
    expect(large.reads()).toBeLessThan(10_000);
  });
});
