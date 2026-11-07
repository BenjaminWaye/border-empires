import type { ClientState } from "./client-state/client-state.js";
import type { TileMenuView } from "./client-types.js";
import { isResourceImprovementAction } from "./client-hud-v2/client-resource-improvement-action.js";
import type { Tile, TileActionDef } from "./client-types.js";
import { structureTypeForTileAction, unmappedBuildActionWarning } from "./client-tile-action-support/client-tile-action-support.js";

export const handleGenericBuildAction = (input: {
  actionId: string;
  state?: ClientState;
  buildAllResources?: boolean;
  viewForTile?: (tile: Tile) => TileMenuView;
  selected: Tile;
  handleBuildAction: (actionId: string, structureType: NonNullable<ReturnType<typeof structureTypeForTileAction>>, tile: Tile) => void;
  pushFeed: (message: string, type?: "info", severity?: "error") => void;
  hideMenu: () => void;
}): boolean => {
  const actionId = input.actionId as TileActionDef["id"];
  const type = structureTypeForTileAction(actionId);
  if (type) {
    if (input.buildAllResources && input.state && input.viewForTile && isResourceImprovementAction(input.actionId)) {
      const resource = input.selected.resource;
      const targets = [...input.state.tiles.values()].filter((tile) =>
        resource && tile.resource === resource && tile.ownerId === input.state?.me && tile.ownershipState === "SETTLED" && !tile.optimisticPending);
      for (const tile of targets) {
        const action = input.viewForTile(tile).buildings.find((candidate) => candidate.id === input.actionId);
        if (action && !action.disabled) input.handleBuildAction(input.actionId, type, tile);
      }
    } else input.handleBuildAction(input.actionId, type, input.selected);
    return true;
  }
  const warning = unmappedBuildActionWarning(actionId);
  if (!warning) return false;
  input.pushFeed(warning, "info", "error");
  input.hideMenu();
  return true;
};
