import { describe, expect, it } from "vitest";
import { chooseRefineryField, eligibleRefineryFields, takenRefineryFieldIds } from "./refinery-field-choice.js";
import { at, buildRefineryGrid, OWNER, placeStructure, ringResolver } from "./refinery-test-fixtures.js";

const TOWN = `${at(0, 0).x},${at(0, 0).y}`;
// Two titanium fields: (3,0) at 3 steps, (6,2)-(7,2) at 6 steps; gems at (2,2).
const map = () => buildRefineryGrid([
  "T..t....",
  "........",
  "..g...tt"
]);

describe("refinery field choice", () => {
  it("lists linked fields nearest first and auto-picks the nearest free one", () => {
    const tiles = map();
    expect(eligibleRefineryFields(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set()).map((field) => [field.anchorX, field.anchorY, field.distance]))
      .toEqual([[13, 10, 3], [16, 12, 6]]);
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set())).toMatchObject({ ok: true, ...at(3, 0) });
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set(["13,10"]))).toMatchObject({ ok: true, ...at(6, 2) });
    expect(chooseRefineryField(tiles, OWNER, "CRYSTAL_REFINERY", TOWN, new Set())).toMatchObject({ ok: true, ...at(2, 2) });
  });

  it("breaks equal distances by the smaller tile", () => {
    const tiles = buildRefineryGrid(["t.T.t"]);
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", `${at(2, 0).x},${at(2, 0).y}`, new Set())).toMatchObject({ ok: true, ...at(0, 0) });
  });

  it("accepts any tile of an explicit, linked, free field", () => {
    expect(chooseRefineryField(map(), OWNER, "TITANIUM_REFINERY", TOWN, new Set(), at(7, 2))).toMatchObject({ ok: true, ...at(7, 2) });
  });

  it("rejects a non-deposit, an unlinked field or a taken field", () => {
    const tiles = map();
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set(), at(1, 0))).toMatchObject({ ok: false, code: "REFINERY_FIELD_INVALID" });
    expect(chooseRefineryField(tiles, OWNER, "UMBRITE_REFINERY", TOWN, new Set(), at(3, 0))).toMatchObject({ ok: false, code: "REFINERY_FIELD_INVALID" });
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set(["16,12"]), at(7, 2))).toMatchObject({ ok: false, code: "REFINERY_FIELD_TAKEN" });
    tiles.get(`${at(5, 2).x},${at(5, 2).y}`)!.terrain = "SEA";
    tiles.get(`${at(5, 1).x},${at(5, 1).y}`)!.terrain = "SEA";
    tiles.get(`${at(5, 0).x},${at(5, 0).y}`)!.terrain = "SEA";
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set(), at(6, 2))).toMatchObject({ ok: false, code: "REFINERY_FIELD_UNLINKED" });
  });

  it("rejects every tile the owner does not hold with one code, before any resource check (no deposit probing)", () => {
    // (4,0) unowned titanium joined to the owned (3,0) field; (0,2) a lone unowned
    // titanium; (2,2) unowned plain land; (6,0) enemy titanium; (7,0) enemy land.
    const tiles = buildRefineryGrid([
      "T..tx.Ee",
      "........",
      "x._....."
    ]);
    for (const [column, row] of [[4, 0], [0, 2], [2, 2], [6, 0], [7, 0], [30, 30]] as const) {
      expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set(), at(column, row)))
        .toEqual({ ok: false, code: "REFINERY_FIELD_INVALID", message: "choose a deposit tile you hold" });
    }
    expect(chooseRefineryField(tiles, OWNER, "TITANIUM_REFINERY", TOWN, new Set(), at(3, 0))).toMatchObject({ ok: true, ...at(3, 0) });
  });

  it("rejects when no free field is linked", () => {
    expect(chooseRefineryField(map(), OWNER, "UMBRITE_REFINERY", TOWN, new Set())).toMatchObject({ ok: false, code: "REFINERY_NO_FIELD" });
  });

  it("counts fields held by the owner's other refineries as taken, except the one being reassigned", () => {
    const tiles = map();
    placeStructure(tiles, 1, 1, { type: "TITANIUM_REFINERY", status: "under_construction", refineryField: { ...at(3, 0), assignedAt: 1 } });
    expect(takenRefineryFieldIds(tiles, OWNER, tiles.values(), ringResolver(0, 0))).toEqual(new Set(["13,10"]));
    expect(takenRefineryFieldIds(tiles, OWNER, tiles.values(), ringResolver(0, 0), `${at(1, 1).x},${at(1, 1).y}`)).toEqual(new Set());
  });
});
