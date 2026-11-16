// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleRefineryTileAction } from "./refinery-action-handler.js";
import { hideRefineryChoiceSheet, isRefineryChoiceSheetOpen, showRefineryChoiceSheet, type RefineryChoiceSheetOptions } from "./refinery-choice-sheet.js";
import { REFINERY_FIXTURE_ME, placeRefineryFixture, refineryFixtureGrid } from "./refinery-fixtures.js";
import { openRefineAtPicker, openRefineryBuildPicker, openRefineryChangeFieldPicker, type RefineryPickerDeps } from "./refinery-picker-flow.js";
import { refineryPickerHighlight } from "./refinery-picker-highlight.js";

const setup = (tiles = refineryFixtureGrid()) => {
  const sheets: RefineryChoiceSheetOptions[] = [];
  const deps: RefineryPickerDeps & { buildRefinery: ReturnType<typeof vi.fn>; sendGameMessage: ReturnType<typeof vi.fn> } = {
    state: { tiles, tilesRevision: 1, me: REFINERY_FIXTURE_ME },
    buildRefinery: vi.fn(() => true),
    sendGameMessage: vi.fn(() => true),
    showSheet: (sheet) => { sheets.push(sheet); return true; }
  };
  return { tiles, deps, sheets };
};

afterEach(() => hideRefineryChoiceSheet());

describe("refinery pickers", () => {
  it("builds straight away when the town has exactly one eligible field", () => {
    const { tiles, deps, sheets } = setup();
    expect(openRefineryBuildPicker("TITANIUM_REFINERY", tiles.get("100,100")!, deps)).toBe(true);
    expect(sheets).toHaveLength(0);
    expect(deps.buildRefinery).toHaveBeenCalledWith(
      { type: "BUILD_STRUCTURE", x: 100, y: 100, structureType: "TITANIUM_REFINERY", fieldX: 106, fieldY: 99 }, "Titanium Refinery at (100, 100)");
  });

  it("asks which field when several are eligible, highlighting reach and fields, greying the unlinked one", () => {
    const tiles = refineryFixtureGrid();
    tiles.set("96,96", { ...tiles.get("96,96")!, resource: "TITANIUM" }); // a second, linked one-tile field
    const { deps, sheets } = setup(tiles);
    openRefineryBuildPicker("TITANIUM_REFINERY", tiles.get("101,101")!, deps);
    expect(sheets).toHaveLength(1);
    expect(sheets[0]!.choices.map((choice) => [choice.label, choice.disabled])).toEqual([
      ["Field at (96, 96)", false], ["Field at (106, 99)", false], ["Field at (110, 100)", true]
    ]);
    expect(sheets[0]!.choices[2]!.reason).toMatch(/Not linked/);
    const highlight = refineryPickerHighlight()!;
    expect(highlight.get("106,99")).toBe("eligible");
    expect(highlight.get("110,100")).toBe("unlinked");
    expect(highlight.get("102,100")).toBe("reach");
    sheets[0]!.onFocus?.(1);
    expect(refineryPickerHighlight()!.get("106,99")).toBe("focus");
    sheets[0]!.onPick(1);
    expect(deps.buildRefinery).toHaveBeenCalledWith(expect.objectContaining({ x: 101, y: 101, fieldX: 106, fieldY: 99 }), "Titanium Refinery at (101, 101)");
    sheets[0]!.onClose?.();
    expect(refineryPickerHighlight()).toBeUndefined();
  });

  it("Refine at… picks the town, then the ring tile (nearest the field first)", () => {
    const { tiles, deps, sheets } = setup();
    openRefineAtPicker(tiles.get("107,99")!, deps);
    expect(sheets[0]!.choices).toHaveLength(1);
    expect(sheets[0]!.choices[0]).toMatchObject({ disabled: false, stat: "+6 slots" });
    expect(refineryPickerHighlight()!.get("101,99")).toBe("site");
    expect(refineryPickerHighlight()!.get("101,100")).toBe("eligible");
    sheets[0]!.onPick(0);
    expect(sheets[1]!.title).toBe("Where in Town at (100, 100)?");
    expect(sheets[1]!.choices[0]).toMatchObject({ label: "Support tile (101, 99)", stat: "Nearest the field" });
    sheets[1]!.onPick(2);
    expect(deps.buildRefinery).toHaveBeenCalledWith(expect.objectContaining({ structureType: "TITANIUM_REFINERY", fieldX: 107, fieldY: 99 }), expect.any(String));
  });

  it("Change field sends ASSIGN_REFINERY_FIELD, and auto-assigns the one other eligible field", () => {
    const tiles = refineryFixtureGrid();
    tiles.set("96,96", { ...tiles.get("96,96")!, resource: "TITANIUM" });
    const { deps, sheets } = setup(tiles);
    const refinery = placeRefineryFixture(tiles, 101, 100, "TITANIUM_REFINERY", { field: { x: 106, y: 99 } });
    openRefineryChangeFieldPicker(refinery, deps);
    expect(sheets[0]!.choices[0]!.label).toBe("Field at (96, 96)");
    expect(sheets[0]!.choices.find((choice) => choice.label.startsWith("Current field"))).toBeDefined();
    sheets[0]!.onPick(0);
    expect(deps.sendGameMessage).toHaveBeenCalledWith({ type: "ASSIGN_REFINERY_FIELD", x: 101, y: 100, fieldX: 96, fieldY: 96 }, expect.any(String));

    // A broken link with exactly one other eligible field: no sheet, it is assigned.
    const single = setup();
    const broken = placeRefineryFixture(single.tiles, 101, 100, "TITANIUM_REFINERY");
    openRefineryChangeFieldPicker(broken, single.deps);
    expect(single.sheets).toHaveLength(0);
    expect(single.deps.sendGameMessage).toHaveBeenCalledWith({ type: "ASSIGN_REFINERY_FIELD", x: 101, y: 100, fieldX: 106, fieldY: 99 }, expect.any(String));
  });

  it("routes the menu rows to the pickers; boosters fall through to the generic build; a greyed row does nothing", () => {
    const { tiles, deps } = setup();
    const hideMenu = vi.fn();
    expect(handleRefineryTileAction({ actionId: "build_titanium_smelter", selected: tiles.get("101,101")!, hideMenu, pickers: deps })).toBe(false);
    expect(handleRefineryTileAction({ actionId: "build_titanium_refinery", selected: tiles.get("101,101")!, row: { disabled: true }, hideMenu, pickers: deps })).toBe(true);
    expect(deps.buildRefinery).not.toHaveBeenCalled();
    expect(handleRefineryTileAction({ actionId: "build_titanium_refinery", selected: tiles.get("101,101")!, row: { disabled: false }, hideMenu, pickers: deps })).toBe(true);
    expect(deps.buildRefinery).toHaveBeenCalledTimes(1);
    expect(hideMenu).toHaveBeenCalledTimes(2);
  });
});

describe("refinery choice sheet", () => {
  it("lists choices with their reason, ignores a greyed one and closes on pick", () => {
    const onPick = vi.fn(), onClose = vi.fn();
    showRefineryChoiceSheet({ title: "Choose a field", choices: [
      { label: "Field at (1, 2)", stat: "+6 slots", detail: "3 tiles", disabled: false },
      { label: "Field at (5, 5)", stat: "+2 slots", detail: "1 tile", disabled: true, reason: "Not linked" }
    ], onPick, onClose });
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-refinery-choice]"));
    expect(buttons[1]!.disabled).toBe(true);
    expect(document.body.textContent).toContain("Not linked");
    buttons[1]!.click();
    expect(onPick).not.toHaveBeenCalled();
    buttons[0]!.click();
    expect(onPick).toHaveBeenCalledWith(0);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(isRefineryChoiceSheetOpen()).toBe(false);
  });
});
