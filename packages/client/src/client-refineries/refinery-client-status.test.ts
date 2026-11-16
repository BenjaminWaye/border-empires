import { describe, expect, it } from "vitest";
import { refineryClientStatus, refineryStatusFor } from "./refinery-client-status.js";
import { REFINERY_FIXTURE_ME, REFINERY_FIXTURE_RIVAL, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";

const FIELD = { x: 106, y: 99 };
const cutLink = (tiles: ReturnType<typeof refineryFixtureGrid>): void => {
  // A rival column at x = 104 separates the town from the field.
  for (let y = 95; y <= 105; y += 1) {
    const tile = tiles.get(`104,${y}`);
    if (tile) Object.assign(tile, { ownerId: REFINERY_FIXTURE_RIVAL, ownershipState: "SETTLED" });
  }
};

describe("refinery client status", () => {
  it("evaluates a linked refinery locally: working, every garrisoned field tile processed", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD });
    const status = refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)!;
    expect(status).toMatchObject({ source: "local", linked: true, working: true, townKey: "100,100", anchor: FIELD });
    expect([...status.processedTileKeys].sort()).toEqual(["106,100", "106,99", "107,99"]);
    expect(status.needsField).toBeUndefined();
  });

  it("keeps the field on the refinery that can work when an older one is being removed", () => {
    const tiles = refineryFixtureGrid();
    placeRefineryFixture(tiles, 99, 100, "TITANIUM_REFINERY", { field: FIELD, assignedAt: 1, status: "removing" });
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD, assignedAt: 50 });
    expect(refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)).toMatchObject({ source: "local", working: true });
  });

  it("prefers the local result over a stale wire status when nearby land changes", () => {
    const tiles = refineryFixtureGrid();
    // The server last sent this refinery while the link was still cut.
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD, wire: { fieldX: 106, fieldY: 99, linked: false, processedTiles: 0 } });
    expect(refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)).toMatchObject({ source: "local", linked: true, working: true });
    // ...and the other way: the wire still says linked, but the path was just captured.
    refinery.economicStructure!.refinery = { fieldX: 106, fieldY: 99, linked: true, processedTiles: 3 };
    cutLink(tiles);
    expect(refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)).toMatchObject({ source: "local", linked: false, working: false, needsField: "UNLINKED", processedTileKeys: [] });
  });

  it("asks for a field when the refinery has none, but not while it is still being built", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY");
    expect(refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)?.needsField).toBe("NO_FIELD");
    refinery.economicStructure!.status = "under_construction";
    expect(refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)?.needsField).toBeUndefined();
  });

  it("marks the newer of two refineries on one field as FIELD_TAKEN", () => {
    const tiles = refineryFixtureGrid();
    placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD, assignedAt: 1 });
    const newer = placeRefineryFixture(tiles, 101, 99, "TITANIUM_REFINERY", { field: { x: 106, y: 100 }, assignedAt: 2 });
    expect(refineryClientStatus(tiles, newer, REFINERY_FIXTURE_ME)).toMatchObject({ needsField: "FIELD_TAKEN", working: false });
  });

  it("falls back to the wire status when the town tile has not streamed in", () => {
    const tiles = refineryFixtureGrid();
    tiles.delete("100,100");
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD, wire: { fieldX: 106, fieldY: 99, linked: true, processedTiles: 3 } });
    const status = refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_ME)!;
    expect(status).toMatchObject({ source: "wire", linked: true, working: true });
    expect(status.processedTileKeys).toHaveLength(3);
  });

  it("shows a rival only whether its refinery is linked: no field, no toast", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { wire: { linked: false } });
    const status = refineryClientStatus(tiles, refinery, REFINERY_FIXTURE_RIVAL)!;
    expect(status).toMatchObject({ source: "wire", linked: false, working: false });
    expect(status.fieldTiles).toBeUndefined();
    expect(status.needsField).toBeUndefined();
  });

  it("recomputes when the tile revision changes", () => {
    const tiles = refineryFixtureGrid();
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: FIELD });
    const view = { tiles, tilesRevision: 1, me: REFINERY_FIXTURE_ME };
    expect(refineryStatusFor(view, refinery)?.linked).toBe(true);
    cutLink(tiles);
    expect(refineryStatusFor(view, refinery)?.linked).toBe(true); // same revision: remembered
    expect(refineryStatusFor({ ...view, tilesRevision: 2 }, refinery)?.linked).toBe(false);
  });
});
