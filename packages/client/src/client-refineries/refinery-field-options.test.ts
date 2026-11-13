import { describe, expect, it } from "vitest";
import { REFINERY_BOOSTER_SLOTS_PER_TILE, REFINERY_SLOTS_PER_TILE, chooseRefineryField, takenRefineryFieldIds, type RefineryTile } from "@border-empires/shared";
import { refineryFieldOptions } from "./refinery-field-options.js";
import { REFINERY_FIXTURE_ME, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";
import { refineAtTownChoices, freeRefineryRingTiles } from "./refinery-towns.js";
import { clientRefineryTownResolver, refineryTilesView } from "./refinery-client-status.js";

const TOWN = "100,100";

describe("refinery field options", () => {
  it("lists the linked field as eligible with its slot gain and the field behind unowned land as unlinked", () => {
    const options = refineryFieldOptions(refineryFixtureGrid(), REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN);
    expect(options.map((option) => [option.fieldId, option.status])).toEqual([["106,99", "eligible"], ["110,100", "unlinked"]]);
    expect(options[0]).toMatchObject({ tileCount: 3, garrisoned: 3, perTileSlots: REFINERY_SLOTS_PER_TILE, slotGain: 3 * REFINERY_SLOTS_PER_TILE, distance: 6 });
    expect(options[1]!.reason).toMatch(/Not linked/);
  });

  it("agrees with the server's own validation (chooseRefineryField) on every eligible field", () => {
    const tiles = refineryFixtureGrid();
    const view = refineryTilesView(tiles);
    for (const option of refineryFieldOptions(tiles, REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN)) {
      const taken = takenRefineryFieldIds(view, REFINERY_FIXTURE_ME, [] as RefineryTile[], clientRefineryTownResolver(tiles));
      const choice = chooseRefineryField(view, REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN, taken, { x: option.anchorX, y: option.anchorY });
      expect(choice.ok).toBe(option.status === "eligible");
    }
  });

  it("greys a field another of your refineries processes, naming it, unless that refinery is the one being reassigned", () => {
    const tiles = refineryFixtureGrid();
    placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    const options = refineryFieldOptions(tiles, REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN);
    expect(options.find((option) => option.fieldId === "106,99")).toMatchObject({ status: "taken", takenBy: { x: 101, y: 100 } });
    expect(options[0]!.reason).toBe("Processed by your refinery at (101, 100)");
    expect(refineryFieldOptions(tiles, REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN, "101,100")[0]).toMatchObject({ fieldId: "106,99", status: "eligible" });
  });

  it("counts the town's active booster in the per-tile gain", () => {
    const tiles = refineryFixtureGrid();
    placeRefineryFixture(tiles, 99, 99, "TITANIUM_SMELTER");
    const [field] = refineryFieldOptions(tiles, REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN);
    expect(field).toMatchObject({ perTileSlots: REFINERY_SLOTS_PER_TILE + REFINERY_BOOSTER_SLOTS_PER_TILE, slotGain: 9 });
  });

  it("only garrisoned tiles give slots now; the full gain assumes every tile garrisoned", () => {
    const tiles = refineryFixtureGrid();
    tiles.get("107,99")!.ownershipState = "FRONTIER";
    const [field] = refineryFieldOptions(tiles, REFINERY_FIXTURE_ME, "TITANIUM_REFINERY", TOWN);
    expect(field).toMatchObject({ garrisoned: 2, slotGain: 4, fullSlotGain: 6 });
  });

  it("offers no Umbrite field where there is none", () => {
    expect(refineryFieldOptions(refineryFixtureGrid(), REFINERY_FIXTURE_ME, "UMBRITE_REFINERY", TOWN)).toEqual([]);
  });
});

describe("Refine at… town choices", () => {
  it("offers the town in reach, with its free ring tiles nearest the field first", () => {
    const tiles = refineryFixtureGrid();
    const [choice, ...rest] = refineAtTownChoices(tiles, REFINERY_FIXTURE_ME, tiles.get("106,100")!);
    expect(rest).toEqual([]);
    expect(choice).toMatchObject({ townKey: TOWN, option: { fieldId: "106,99", status: "eligible" } });
    expect(choice!.disabledReason).toBeUndefined();
    expect(choice!.ringTiles).toHaveLength(8);
    expect(`${choice!.ringTiles[0]!.x},${choice!.ringTiles[0]!.y}`).toBe("101,100");
  });

  it("greys the town when its ring is full, and when the field is not linked", () => {
    const tiles = refineryFixtureGrid();
    for (const tile of freeRefineryRingTiles(tiles, REFINERY_FIXTURE_ME, tiles.get(TOWN)!)) tile.economicStructure = { type: "MANUFACTORY", ownerId: REFINERY_FIXTURE_ME, status: "active" };
    expect(refineAtTownChoices(tiles, REFINERY_FIXTURE_ME, tiles.get("106,100")!)[0]!.disabledReason).toBe("No free support tile in this town");
    expect(refineAtTownChoices(tiles, REFINERY_FIXTURE_ME, tiles.get("110,100")!)[0]!.disabledReason).toMatch(/Not linked/);
  });

  it("lists nothing for a deposit no town of yours reaches, or for a tile that is not a strategic deposit", () => {
    const tiles = refineryFixtureGrid();
    tiles.set("140,100", { x: 140, y: 100, terrain: "LAND", resource: "TITANIUM", ownerId: REFINERY_FIXTURE_ME, ownershipState: "SETTLED" });
    expect(refineAtTownChoices(tiles, REFINERY_FIXTURE_ME, tiles.get("140,100")!)).toEqual([]);
    expect(refineAtTownChoices(tiles, REFINERY_FIXTURE_ME, tiles.get("101,101")!)).toEqual([]);
  });
});
