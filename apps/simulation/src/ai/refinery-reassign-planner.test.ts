import { describe, expect, it } from "vitest";
import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";
import { AI, at, placeStructure, plannerRefineryMap } from "./build/refinery-planner-test-map.js";
import { chooseRefineryReassignment, planRefineryReassignment } from "./refinery-reassign-planner.js";
import type { StructurePlannerTile } from "./structure-command-planner.js";

// Town T at (21,21). Field A = (23,21)-(24,21) is linked; field C = (27,21)
// is the AI's but cut off by the unowned column 6, so not linked.
const ROWS = [
  "......_..",
  ".T.tt._t.",
  "......_.."
];
const town = (tiles: Map<string, StructurePlannerTile>) => [tiles.get("21,21")!];

describe("chooseRefineryReassignment", () => {
  it("moves a refinery off an unlinked field onto the nearest eligible one", () => {
    const tiles = plannerRefineryMap(ROWS);
    placeStructure(tiles, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(7, 1), assignedAt: 1 } });
    expect(chooseRefineryReassignment(AI, tiles, town(tiles))).toEqual({ ...at(0, 0), fieldX: 23, fieldY: 21 });
  });

  it("assigns a refinery that holds no field, and the loser of a shared field", () => {
    const unassigned = plannerRefineryMap(ROWS);
    placeStructure(unassigned, 0, 0, { type: "TITANIUM_REFINERY" });
    expect(chooseRefineryReassignment(AI, unassigned, town(unassigned))).toEqual({ ...at(0, 0), fieldX: 23, fieldY: 21 });

    const shared = plannerRefineryMap(["..........", ".T.tt..t..", ".........."]);
    placeStructure(shared, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(3, 1), assignedAt: 1 } });
    placeStructure(shared, 2, 2, { type: "TITANIUM_REFINERY", refineryField: { ...at(4, 1), assignedAt: 5 } });
    expect(chooseRefineryReassignment(AI, shared, town(shared))).toEqual({ ...at(2, 2), fieldX: 27, fieldY: 21 });
  });

  it("leaves working refineries, and idle ones with nowhere better to go, alone", () => {
    const working = plannerRefineryMap(ROWS);
    placeStructure(working, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(3, 1), assignedAt: 1 } });
    expect(chooseRefineryReassignment(AI, working, town(working))).toBeUndefined();

    const stranded = plannerRefineryMap(["......_..", ".T....._t", "......_.."]);
    placeStructure(stranded, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(8, 1), assignedAt: 1 } });
    expect(chooseRefineryReassignment(AI, stranded, town(stranded))).toBeUndefined();

    const removing = plannerRefineryMap(ROWS);
    placeStructure(removing, 0, 0, { type: "TITANIUM_REFINERY", status: "removing", refineryField: { ...at(7, 1), assignedAt: 1 } });
    expect(chooseRefineryReassignment(AI, removing, town(removing))).toBeUndefined();
  });

  it("skips a reassignment the server just rejected", () => {
    const tiles = plannerRefineryMap(ROWS);
    placeStructure(tiles, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(7, 1), assignedAt: 1 } });
    expect(chooseRefineryReassignment(AI, tiles, town(tiles), () => true)).toBeUndefined();
  });
});

describe("planRefineryReassignment", () => {
  const input = (tiles: Map<string, StructurePlannerTile>, extra: Partial<AutomationPlannerInput<AutomationPlannerTile>> = {}) => ({
    playerId: AI, sessionPrefix: "ai-runtime", hasActiveLock: false, clientSeq: 7, issuedAt: 1_000,
    tilesByKey: tiles, ownedTiles: [...tiles.values()].filter((tile) => tile.ownerId === AI), frontierTiles: [],
    ...extra
  }) as unknown as AutomationPlannerInput<AutomationPlannerTile>;

  it("emits ASSIGN_REFINERY_FIELD with the chosen field", () => {
    const tiles = plannerRefineryMap(ROWS);
    placeStructure(tiles, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(7, 1), assignedAt: 1 } });
    const result = planRefineryReassignment(input(tiles));
    expect(result?.command).toMatchObject({ type: "ASSIGN_REFINERY_FIELD", playerId: AI });
    expect(JSON.parse(result!.command!.payloadJson)).toEqual({ x: 20, y: 20, fieldX: 23, fieldY: 21 });
    expect(planRefineryReassignment(input(tiles, { blockedActionKeys: new Map([["ASSIGN_REFINERY_FIELD:20,20", "REFINERY_FIELD_TAKEN"]]) }))).toBeUndefined();
  });

  it("does no scan when the cached counts show no refinery", () => {
    const tiles = plannerRefineryMap(ROWS);
    placeStructure(tiles, 0, 0, { type: "TITANIUM_REFINERY", refineryField: { ...at(7, 1), assignedAt: 1 } });
    expect(planRefineryReassignment(input(tiles, { ownedStructureCounts: { MANUFACTORY: 2 } }))).toBeUndefined();
    expect(planRefineryReassignment(input(tiles, { ownedStructureCounts: { TITANIUM_REFINERY: 1 } }))).toBeDefined();
    expect(planRefineryReassignment(input(tiles, { sessionPrefix: "ai-preview" as never }))).toBeUndefined();
  });
});
