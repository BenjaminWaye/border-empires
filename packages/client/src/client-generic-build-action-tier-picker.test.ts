import { describe, expect, it, vi } from "vitest";
import { handleGenericBuildAction } from "./client-generic-build-action.js";
import type { StructureTierSheetOptions } from "./client-structure-tier-sheet/client-structure-tier-sheet.js";
import type { StructureTierOption, Tile, TileActionDef, TileMenuView } from "./client-types.js";

const tile = { x: 4, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED" } as Tile;
const fortOption = { structureType: "FORT", tier: "TITANIUM_BASTION", variant: "TITANIUM_BASTION", label: "Titanium Bastion", stat: "", cost: "", disabled: false } as StructureTierOption;
const palisadeOption = { structureType: "PALISADE", variant: "PALISADE", label: "Palisade", stat: "", cost: "", disabled: false } as StructureTierOption;

const run = (row: Partial<TileActionDef>) => {
  const sheets: StructureTierSheetOptions[] = [];
  const handleBuildAction = vi.fn();
  const hideMenu = vi.fn();
  const handled = handleGenericBuildAction({
    actionId: "build_fortification",
    selected: tile,
    handleBuildAction,
    pushFeed: () => undefined,
    hideMenu,
    viewForTile: () => ({ buildings: [{ id: "build_fortification", label: "Fortify", ...row }] }) as unknown as TileMenuView,
    showTierSheet: (sheet) => { sheets.push(sheet); return true; }
  });
  return { handled, sheets, handleBuildAction, hideMenu };
};

describe("Fortify / Siege rows open the tier picker", () => {
  it("opens the sheet instead of building, and builds the picked tier", () => {
    const { handled, sheets, handleBuildAction, hideMenu } = run({ tierOptions: [palisadeOption, fortOption] });
    expect(handled).toBe(true);
    expect(hideMenu).toHaveBeenCalled();
    expect(handleBuildAction).not.toHaveBeenCalled();
    expect(sheets[0]?.options).toEqual([palisadeOption, fortOption]);

    sheets[0]?.onPick(fortOption);
    expect(handleBuildAction).toHaveBeenCalledWith("build_fortification", "FORT", tile, "TITANIUM_BASTION");
    sheets[0]?.onPick(palisadeOption);
    expect(handleBuildAction).toHaveBeenLastCalledWith("build_fortification", "PALISADE", tile, undefined);
  });

  it("does nothing for a disabled row", () => {
    const { handled, sheets, handleBuildAction } = run({ disabled: true, tierOptions: [{ ...fortOption, disabled: true }] });
    expect(handled).toBe(true);
    expect(sheets).toEqual([]);
    expect(handleBuildAction).not.toHaveBeenCalled();
  });

  it("falls back to a direct build when the row carries no tiers", () => {
    const { sheets, handleBuildAction } = run({});
    expect(sheets).toEqual([]);
    expect(handleBuildAction).toHaveBeenCalledWith("build_fortification", "FORT", tile);
  });
});
