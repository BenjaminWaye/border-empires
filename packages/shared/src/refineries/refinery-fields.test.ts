import { describe, expect, it } from "vitest";
import { refineryFieldAt, refineryFieldLinked, refineryReachFromTown, refineryTileKey } from "./refinery-fields.js";
import { at, buildRefineryGrid, OWNER } from "./refinery-test-fixtures.js";
import { REFINERY_REACH_LAND_TILES } from "./refinery-constants.js";

const linked = (rows: string[], fieldColumn: number, fieldRow = 0): boolean => {
  const tiles = buildRefineryGrid(rows);
  const anchor = at(fieldColumn, fieldRow);
  const field = refineryFieldAt(tiles, anchor.x, anchor.y, "TITANIUM")!;
  const town = at(0, 0);
  return refineryFieldLinked(tiles, OWNER, refineryTileKey(town.x, town.y), field);
};

describe("refineryFieldAt", () => {
  it("joins diagonal neighbours into one 8-connected field", () => {
    const tiles = buildRefineryGrid([
      "t.._",
      ".t._",
      "..xt"
    ]);
    const field = refineryFieldAt(tiles, at(0, 0).x, at(0, 0).y, "TITANIUM")!;
    expect([...field.keys].sort()).toEqual(["10,10", "11,11", "12,12", "13,12"].sort());
    expect(field.id).toBe("10,10");
    // Any tile of the field yields the same field.
    expect(refineryFieldAt(tiles, at(3, 2).x, at(3, 2).y, "TITANIUM")!.id).toBe(field.id);
  });

  it("keeps different resources and non-touching deposits apart", () => {
    const tiles = buildRefineryGrid([
      "tg..t",
      "....."
    ]);
    expect([...refineryFieldAt(tiles, at(0, 0).x, at(0, 0).y, "TITANIUM")!.keys]).toEqual(["10,10"]);
    expect([...refineryFieldAt(tiles, at(1, 0).x, at(1, 0).y, "GEMS")!.keys]).toEqual(["11,10"]);
    expect(refineryFieldAt(tiles, at(1, 0).x, at(1, 0).y, "TITANIUM")).toBeUndefined();
    expect(refineryFieldAt(tiles, at(2, 0).x, at(2, 0).y, "TITANIUM")).toBeUndefined();
  });
});

describe("refinery link", () => {
  it(`reaches a field ${REFINERY_REACH_LAND_TILES} land tiles away but not ${REFINERY_REACH_LAND_TILES + 1}`, () => {
    expect(linked(["T.........t"], 10)).toBe(true);
    expect(linked(["T..........t"], 11)).toBe(false);
  });

  it("is broken by water, mountains, unowned land and another player's land", () => {
    expect(linked(["T..~..t"], 6)).toBe(false);
    expect(linked(["T..^..t"], 6)).toBe(false);
    expect(linked(["T.._..t"], 6)).toBe(false);
    expect(linked(["T..e..t"], 6)).toBe(false);
  });

  it("crosses the owner's frontier land and steps diagonally", () => {
    expect(linked(["T.ff.t"], 5)).toBe(true);
    expect(linked([
      "T~~",
      "~.~",
      "~~t"
    ], 2, 2)).toBe(true);
  });

  it("can reach an owned deposit tile even when the rest of the field is not owned", () => {
    expect(linked(["T..tx"], 4)).toBe(true);
    // The field's only tile is unowned: the owner's land never reaches it.
    expect(linked(["T..x"], 3)).toBe(false);
  });

  it("measures land steps from the town tile", () => {
    const tiles = buildRefineryGrid(["T.f"]);
    const reach = refineryReachFromTown(tiles, OWNER, at(0, 0).x, at(0, 0).y);
    expect(reach.get("10,10")).toBe(0);
    expect(reach.get("12,10")).toBe(2);
  });
});
