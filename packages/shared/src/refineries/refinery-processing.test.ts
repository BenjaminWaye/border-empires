import { describe, expect, it } from "vitest";
import { evaluateRefineries, refinerySlotBonusesByTile, refineryWireStatus } from "./refinery-processing.js";
import { evaluateRefineryAt } from "./refinery-local.js";
import { takenRefineryFieldIds } from "./refinery-field-choice.js";
import { at, buildRefineryGrid, ENEMY, OWNER, placeStructure, ringResolver } from "./refinery-test-fixtures.js";
import type { RefineryTile } from "./refinery-types.js";

// Town at (0,0); its ring (radius 1, see ringResolver) holds the refineries.
// Titanium field: (3,0) settled, (4,0) settled, (4,1) frontier.
const baseMap = (): Map<string, RefineryTile> => buildRefineryGrid([
  "T..tt.",
  "....r.",
  "......"
]);
const resolve = ringResolver(0, 0);
const field = (column: number, row: number, assignedAt: number) => ({ ...at(column, row), assignedAt });

const evaluate = (tiles: Map<string, RefineryTile>) => evaluateRefineries(tiles, tiles.values(), resolve);

describe("refinery processing", () => {
  it("adds +2 to every garrisoned tile of a linked field, not to its frontier tiles", () => {
    const tiles = baseMap();
    placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
    const bonuses = refinerySlotBonusesByTile(evaluate(tiles).values());
    expect(Object.fromEntries(bonuses)).toEqual({
      "13,10": [{ sourceId: "TITANIUM_REFINERY", slots: 2 }],
      "14,10": [{ sourceId: "TITANIUM_REFINERY", slots: 2 }]
    });
  });

  it("adds +1 more per tile while an active booster stands on the same town's ring", () => {
    const tiles = baseMap();
    placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
    const booster = placeStructure(tiles, 0, 1, { type: "TITANIUM_SMELTER", status: "active" });
    expect(refinerySlotBonusesByTile(evaluate(tiles).values()).get("13,10")).toEqual([
      { sourceId: "TITANIUM_REFINERY", slots: 2 }, { sourceId: "TITANIUM_SMELTER", slots: 1 }
    ]);
    // A booster of another resource, or one still being built, does nothing.
    booster.economicStructure = { ownerId: booster.economicStructure!.ownerId, type: "UMBRITE_DISTILLERY", status: "active" };
    expect(refinerySlotBonusesByTile(evaluate(tiles).values()).get("13,10")).toEqual([{ sourceId: "TITANIUM_REFINERY", slots: 2 }]);
    booster.economicStructure = { ownerId: booster.economicStructure.ownerId, type: "TITANIUM_SMELTER", status: "under_construction" };
    expect(refinerySlotBonusesByTile(evaluate(tiles).values()).get("13,10")).toEqual([{ sourceId: "TITANIUM_REFINERY", slots: 2 }]);
  });

  it("gives nothing while unlinked, inactive, unfinished, or when its tile is held by another player", () => {
    const unlinked = buildRefineryGrid(["T.~tt.", "......"]);
    placeStructure(unlinked, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
    // (1,1) -> (2,1) -> (3,0) is still a land path; cut it.
    unlinked.get(`${at(2, 1).x},${at(2, 1).y}`)!.terrain = "SEA";
    const unlinkedEval = evaluate(unlinked).get(`${at(1, 1).x},${at(1, 1).y}`)!;
    expect(unlinkedEval.linked).toBe(false);
    expect(refinerySlotBonusesByTile([unlinkedEval]).size).toBe(0);

    for (const status of ["inactive", "under_construction"]) {
      const tiles = baseMap();
      placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status, refineryField: field(3, 0, 1) });
      expect(refinerySlotBonusesByTile(evaluate(tiles).values()).size).toBe(0);
    }

    const captured = baseMap();
    const refinery = placeStructure(captured, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
    refinery.ownerId = ENEMY;
    expect(refinerySlotBonusesByTile(evaluate(captured).values()).size).toBe(0);
  });

  it("lets the older assignment hold a shared field; the newer refinery is unassigned", () => {
    const tiles = baseMap();
    placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(4, 0, 50) });
    placeStructure(tiles, 1, 0, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 20) });
    const result = evaluate(tiles);
    const older = result.get(`${at(1, 0).x},${at(1, 0).y}`)!;
    const newer = result.get(`${at(1, 1).x},${at(1, 1).y}`)!;
    expect(older.working).toBe(true);
    expect(newer.working).toBe(false);
    expect(newer.unassignedReason).toBe("FIELD_TAKEN");
    expect(refineryWireStatus(newer, true)).toEqual({ unassigned: true });
    // Each processed tile is counted once.
    expect(refinerySlotBonusesByTile(result.values()).get("13,10")).toEqual([{ sourceId: "TITANIUM_REFINERY", slots: 2 }]);
  });

  it("never lets an older refinery that cannot work beat (or reserve the field from) one that can", () => {
    const rivals: Array<[string, (tiles: Map<string, RefineryTile>) => RefineryTile]> = [
      ["being removed", (tiles) => placeStructure(tiles, 1, 0, { type: "TITANIUM_REFINERY", status: "removing", refineryField: field(3, 0, 1) })],
      ["on a FRONTIER tile", (tiles) => {
        const rival = placeStructure(tiles, 1, 0, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
        rival.ownershipState = "FRONTIER";
        return rival;
      }],
      ["off any town it holds", (tiles) => placeStructure(tiles, 2, 2, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) })]
    ];
    for (const [label, placeRival] of rivals) {
      const tiles = baseMap();
      const working = placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(4, 0, 50) });
      const rival = placeRival(tiles);
      const result = evaluate(tiles);
      expect(result.get(`${working.x},${working.y}`)!.working, label).toBe(true);
      expect(result.get(`${rival.x},${rival.y}`)!.unassignedReason, label).toBe("FIELD_TAKEN");
      expect(evaluateRefineryAt(tiles, working, resolve)!.working, label).toBe(true);
      expect(takenRefineryFieldIds(tiles, OWNER, [rival], resolve), label).toEqual(new Set());
      expect(takenRefineryFieldIds(tiles, OWNER, [working], resolve), label).toEqual(new Set(["13,10"]));
    }
  });

  it("gives every refinery of one town the same result as evaluating it alone (shared reach)", () => {
    const tiles = buildRefineryGrid([
      "T..tt.",
      "......",
      "...m.."
    ]);
    placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
    placeStructure(tiles, 1, 0, { type: "UMBRITE_REFINERY", status: "active", refineryField: field(3, 2, 2) });
    placeStructure(tiles, 0, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(4, 0, 3) });
    const together = evaluate(tiles);
    expect(together.size).toBe(3);
    for (const [key, evaluation] of together) {
      const tile = tiles.get(key)!;
      const rivals = [...tiles.values()].filter((other) => other.economicStructure && other.economicStructure.type === tile.economicStructure!.type);
      expect(evaluateRefineries(tiles, rivals, resolve).get(key)).toEqual(evaluation);
    }
    // Map order: (1,0) umbrite, (0,1) the newer titanium (field taken), (1,1) titanium.
    expect([...together.values()].map((evaluation) => [evaluation.working, evaluation.processedTileKeys.length]))
      .toEqual([[true, 1], [false, 0], [true, 2]]);
  });

  it("re-anchors to another owned tile of the field, and is unassigned once none is left", () => {
    const tiles = baseMap();
    placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(4, 0, 1) });
    const anchor = tiles.get(`${at(4, 0).x},${at(4, 0).y}`)!;
    delete anchor.ownerId;
    delete anchor.ownershipState;
    const evaluation = evaluate(tiles).get(`${at(1, 1).x},${at(1, 1).y}`)!;
    expect(evaluation.anchor).toEqual(at(3, 0));
    expect(evaluation.processedTileKeys).toEqual(["13,10"]);

    // The anchor stops being a deposit: the neighbouring field takes over.
    delete anchor.resource;
    expect(evaluate(tiles).get(`${at(1, 1).x},${at(1, 1).y}`)!.anchor).toEqual(at(3, 0));

    for (const key of ["13,10", "14,11"]) delete tiles.get(key)!.ownerId;
    const lost = evaluate(tiles).get(`${at(1, 1).x},${at(1, 1).y}`)!;
    expect(lost.unassignedReason).toBe("FIELD_LOST");
    expect(refineryWireStatus(lost, true)).toEqual({ unassigned: true });
  });

  it("reports the field and output to its owner and only the link to others", () => {
    const tiles = baseMap();
    const refinery = placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 1) });
    const evaluation = evaluateRefineryAt(tiles, refinery, resolve)!;
    expect(refineryWireStatus(evaluation, true)).toEqual({ fieldX: at(3, 0).x, fieldY: at(3, 0).y, linked: true, processedTiles: 2 });
    expect(refineryWireStatus(evaluation, false)).toEqual({ linked: true });
  });

  it("finds a rival on the same field without a per-owner list", () => {
    const tiles = baseMap();
    placeStructure(tiles, 1, 0, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(3, 0, 20) });
    const newer = placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "active", refineryField: field(4, 0, 50) });
    expect(evaluateRefineryAt(tiles, newer, resolve)!.unassignedReason).toBe("FIELD_TAKEN");
  });
});
