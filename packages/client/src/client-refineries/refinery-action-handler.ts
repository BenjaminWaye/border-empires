// Routes the refinery tile-menu rows to their pickers (refinery-picker-flow.ts)
// instead of the generic build path: a refinery build needs a field, so its
// row opens the field picker; "Refine at…" opens the town picker; "Change
// field" opens the field picker for the refinery. Boosters are ordinary
// one-per-town support buildings and fall through to the generic build.
import { isRefineryType } from "@border-empires/shared";
import type { Tile, TileActionDef } from "../client-types.js";
import { refineryStructureForAction } from "./refinery-action-ids.js";
import { openRefineAtPicker, openRefineryBuildPicker, openRefineryChangeFieldPicker, type RefineryPickerDeps } from "./refinery-picker-flow.js";

export type RefineryActionHandlerInput = {
  actionId: string;
  selected: Tile;
  /** The menu row as shown, so a greyed row does nothing (its reason is already on screen). */
  row?: Pick<TileActionDef, "disabled"> | undefined;
  hideMenu: () => void;
  /** Tests pass the picker plumbing; the app uses the one installed at bootstrap. */
  pickers?: RefineryPickerDeps;
};

/** True when the action was a refinery picker row (handled, even if greyed). */
export const handleRefineryTileAction = (input: RefineryActionHandlerInput): boolean => {
  const type = refineryStructureForAction(input.actionId);
  const isPickerRow = input.actionId === "refine_at_town" || input.actionId === "change_refinery_field" || isRefineryType(type);
  if (!isPickerRow) return false;
  input.hideMenu();
  if (input.row?.disabled) return true;
  if (input.actionId === "refine_at_town") openRefineAtPicker(input.selected, input.pickers);
  else if (input.actionId === "change_refinery_field") openRefineryChangeFieldPicker(input.selected, input.pickers);
  else if (isRefineryType(type)) openRefineryBuildPicker(type, input.selected, input.pickers);
  return true;
};
