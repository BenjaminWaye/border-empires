import { structureRequiresTownOrSupportTile } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { TileMenuView } from "./client-types.js";
import { isResourceImprovementAction } from "./client-hud-v2/client-resource-improvement-action.js";
import type { OptimisticStructureKind, Tile, TileActionDef } from "./client-types.js";
import { structureTypeForTileAction, unmappedBuildActionWarning } from "./client-tile-action-support/client-tile-action-support.js";

export const handleGenericBuildAction = (input: {
  actionId: string;
  state?: ClientState;
  buildAllResources?: boolean;
  queueDevelopmentAction?: (entry: ClientState["developmentQueue"][number]) => boolean;
  viewForTile?: (tile: Tile) => TileMenuView;
  selected: Tile;
  handleBuildAction: (actionId: string, structureType: NonNullable<ReturnType<typeof structureTypeForTileAction>>, tile: Tile) => void;
  pushFeed: (message: string, type?: "info", severity?: "error") => void;
  hideMenu: () => void;
}): boolean => {
  const actionId = input.actionId as TileActionDef["id"];
  const type = structureTypeForTileAction(actionId);
  if (type) {
    const enqueue = (tile: Tile, label: string): boolean => input.queueDevelopmentAction?.({
      kind: "BUILD", x: tile.x, y: tile.y, tileKey: `${tile.x},${tile.y}`, label: `${label} at (${tile.x}, ${tile.y})`,
      optimisticKind: type as OptimisticStructureKind,
      payload: { type: "BUILD_STRUCTURE", x: tile.x, y: tile.y, structureType: type }
    }) ?? false;
    // Concrete support orders use the paced queue even when the cached slot count still reports room.
    if (input.queueDevelopmentAction && input.state && input.selected.ownerId === input.state.me &&
        input.selected.ownershipState === "SETTLED" && !input.selected.town && structureRequiresTownOrSupportTile(type)) {
      const action = input.viewForTile?.(input.selected).buildings.find((candidate) => candidate.id === input.actionId);
      if (!action?.disabled) enqueue(input.selected, action?.label ?? type);
      input.hideMenu();
      return true;
    }
    if (input.buildAllResources && input.state && input.viewForTile && input.queueDevelopmentAction && isResourceImprovementAction(input.actionId)) {
      const resource = input.selected.resource;
      const targets = [...input.state.tiles.values()].filter((tile) =>
        resource && tile.resource === resource && tile.ownerId === input.state?.me && tile.ownershipState === "SETTLED" && !tile.optimisticPending);
      let queued = 0;
      for (const tile of targets) {
        const action = input.viewForTile(tile).buildings.find((candidate) => candidate.id === input.actionId);
        if (action && !action.disabled && enqueue(tile, action.label)) queued += 1;
      }
      input.pushFeed(`Queued ${queued} resource improvements.`);
      input.hideMenu();
    } else input.handleBuildAction(input.actionId, type, input.selected);
    return true;
  }
  const warning = unmappedBuildActionWarning(actionId);
  if (!warning) return false;
  input.pushFeed(warning, "info", "error");
  input.hideMenu();
  return true;
};
