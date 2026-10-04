import type { Tile, TileActionDef } from "./client-types.js";
import { structureTypeForTileAction, unmappedBuildActionWarning } from "./client-tile-action-support/client-tile-action-support.js";

export const handleGenericBuildAction = (input: {
  actionId: string;
  selected: Tile;
  handleBuildAction: (actionId: string, structureType: NonNullable<ReturnType<typeof structureTypeForTileAction>>, tile: Tile) => void;
  pushFeed: (message: string, type?: "info", severity?: "error") => void;
  hideMenu: () => void;
}): boolean => {
  const actionId = input.actionId as TileActionDef["id"];
  const type = structureTypeForTileAction(actionId);
  if (type) {
    input.handleBuildAction(input.actionId, type, input.selected);
    return true;
  }
  const warning = unmappedBuildActionWarning(actionId);
  if (!warning) return false;
  input.pushFeed(warning, "info", "error");
  input.hideMenu();
  return true;
};
