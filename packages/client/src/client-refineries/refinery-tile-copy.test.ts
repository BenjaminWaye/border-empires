import { describe, expect, it } from "vitest";
import { resourceTileOverviewLines } from "../client-tile-menu-view/client-resource-tile-copy.js";
import { REFINERY_FIXTURE_ME, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";

const html = (lines: ReadonlyArray<{ html: string }>): string => lines.map((line) => line.html).join(" ");

describe("refinery tile copy", () => {
  it("tells a bare deposit's owner it is refinable, with the slot numbers", () => {
    const tiles = refineryFixtureGrid();
    const text = html(resourceTileOverviewLines(tiles.get("106,99")!, { me: REFINERY_FIXTURE_ME, tiles, tilesRevision: 1 }));
    expect(text).toContain("Base supply");
    expect(text).toContain("Refinable");
    expect(text).toContain("+2 slots");
    expect(text).toContain("+3 with its booster");
  });

  it("names the refinery that processes a deposit", () => {
    const tiles = refineryFixtureGrid();
    placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    const text = html(resourceTileOverviewLines(tiles.get("107,99")!, { me: REFINERY_FIXTURE_ME, tiles, tilesRevision: 1 }));
    expect(text).toContain("Refined");
    expect(text).toContain("Processed by your Titanium Refinery at (101, 100)");
  });

  it("shows a refinery's field, processed tiles and slots, and a booster's effect", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    const text = html(resourceTileOverviewLines(refinery, { me: REFINERY_FIXTURE_ME, tiles, tilesRevision: 1 }));
    expect(text).toContain("Field");
    expect(text).toContain("(106, 99)");
    expect(text).toContain("3 tiles");
    expect(text).toContain("+6");
    expect(text).toContain("Titanium Smelter");
    const booster = placeRefineryFixture(tiles, 99, 100, "TITANIUM_SMELTER");
    expect(html(resourceTileOverviewLines(booster, { me: REFINERY_FIXTURE_ME, tiles, tilesRevision: 2 }))).toContain("+3 slots instead of +2");
  });

  it("keeps a rival's field private", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { wire: { linked: true } });
    const text = html(resourceTileOverviewLines(refinery, { me: "p2", tiles, tilesRevision: 1 }));
    expect(text).toContain("Linked");
    expect(text).not.toContain("(106, 99)");
  });
});
