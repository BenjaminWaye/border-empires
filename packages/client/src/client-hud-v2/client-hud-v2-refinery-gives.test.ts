import { describe, expect, it } from "vitest";
import { refineryStatusFor } from "../client-refineries/refinery-client-status.js";
import { REFINERY_FIXTURE_ME, placeRefineryFixture, refineryFixtureGrid } from "../client-refineries/refinery-fixtures.js";
import type { Tile } from "../client-types.js";
import { builtStructureFacts, tileFactsFor } from "./client-hud-v2-tile-facts.js";

const noView = { overviewLines: [] };
const gives = (facts: ReadonlyArray<{ label: string; value: string }>): string | undefined => facts.find((f) => f.label === "Gives")?.value;

const factsFor = (tiles: Map<string, Tile>, tile: Tile, me = REFINERY_FIXTURE_ME) =>
  tileFactsFor(tile, noView, me, Date.now(), undefined, (t) => refineryStatusFor({ tiles, tilesRevision: 1, me }, t));

describe("refinery Gives fact", () => {
  it("shows what a working refinery yields now, not the catalog's rate and reach", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(gives(factsFor(tiles, refinery))).toBe("+6 Titanium slots · 3/3 field tiles garrisoned");
  });

  it("counts only garrisoned field tiles", () => {
    const tiles = refineryFixtureGrid();
    Object.assign(tiles.get("107,99")!, { ownershipState: "FRONTIER" });
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(gives(factsFor(tiles, refinery))).toBe("+4 Titanium slots · 2/3 field tiles garrisoned");
  });

  it("warns when the refinery has no field", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY");
    expect(factsFor(tiles, refinery).find((f) => f.label === "Gives")).toEqual({ label: "Gives", value: "Nothing · no field", tone: "warn" });
  });

  it("gives a rival's refinery the per-tile rate, named by resource", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "CRYSTAL_REFINERY", { ownerId: "p2", wire: { linked: true } });
    Object.assign(refinery, { ownerId: "p2" });
    expect(gives(factsFor(tiles, refinery))).toBe("+2 Crystal slots per garrisoned field tile");
  });

  it("falls back to the named rate without a status lookup (town screen card)", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(gives(builtStructureFacts(refinery, true))).toBe("+2 Titanium slots per garrisoned field tile");
    expect(gives(builtStructureFacts(refinery, true, Date.now(), undefined, (t) => refineryStatusFor({ tiles, tilesRevision: 2, me: REFINERY_FIXTURE_ME }, t))))
      .toBe("+6 Titanium slots · 3/3 field tiles garrisoned");
  });

  it("counts the booster's extra slot per tile", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    placeRefineryFixture(tiles, 99, 100, "TITANIUM_SMELTER");
    expect(gives(factsFor(tiles, refinery))).toBe("+9 Titanium slots · 3/3 field tiles garrisoned");
  });

  it("warns when the link to the field is broken, matching the toast", () => {
    const tiles = refineryFixtureGrid();
    for (let y = 95; y <= 105; y += 1) Object.assign(tiles.get(`104,${y}`)!, { ownerId: "p2", ownershipState: "SETTLED" });
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(gives(factsFor(tiles, refinery))).toBe("Nothing · link broken");
  });

  it("warns when no field tile is garrisoned", () => {
    const tiles = refineryFixtureGrid();
    for (const key of ["106,99", "107,99", "106,100"]) Object.assign(tiles.get(key)!, { ownershipState: "FRONTIER" });
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    expect(factsFor(tiles, refinery).find((f) => f.label === "Gives")).toEqual({ label: "Gives", value: "Nothing · garrison its Titanium field", tone: "warn" });
  });

  it("says a switched-off refinery gives nothing", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 }, status: "inactive" });
    expect(gives(factsFor(tiles, refinery))).toBe("Nothing · switched off");
  });

  it("leaves a dormant refinery's Gives to the dormancy line", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    const facts = tileFactsFor(refinery, noView, REFINERY_FIXTURE_ME, Date.now(), () => ["FOOD"],
      (t) => refineryStatusFor({ tiles, tilesRevision: 3, me: REFINERY_FIXTURE_ME }, t));
    expect(gives(facts)).toMatch(/^No /);
  });
});
