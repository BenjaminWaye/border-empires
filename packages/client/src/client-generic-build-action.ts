import { structureRequiresTownOrSupportTile, type ChosenStructureTier } from "@border-empires/shared";
import type { ClientState } from "./client-state/client-state.js";
import type { TileMenuView } from "./client-types.js";
import type { OptimisticStructureKind, Tile, TileActionDef } from "./client-types.js";
import { structureTypeForTileAction, unmappedBuildActionWarning } from "./client-tile-action-support/client-tile-action-support.js";
import { showStructureTierSheet } from "./client-structure-tier-sheet/client-structure-tier-sheet.js";
import { handleRefineryTileAction } from "./client-refineries/refinery-action-handler.js";

export const handleGenericBuildAction = (input: {
  actionId: string;
  state?: ClientState;
  queueDevelopmentAction?: (entry: ClientState["developmentQueue"][number]) => boolean;
  viewForTile?: (tile: Tile) => TileMenuView;
  selected: Tile;
  handleBuildAction: (actionId: string, structureType: NonNullable<ReturnType<typeof structureTypeForTileAction>>, tile: Tile, tier?: ChosenStructureTier) => void;
  /** Opens the Fortify / Siege tier picker; defaults to the DOM sheet (tests pass a stub). */
  showTierSheet?: typeof showStructureTierSheet;
  pushFeed: (message: string, type?: "info", severity?: "error") => void;
  hideMenu: () => void;
}): boolean => {
  const actionId = input.actionId as TileActionDef["id"];
  // Refinery rows open a field / town picker first (client-refineries/refinery-action-handler.ts).
  const view = input.viewForTile?.(input.selected);
  const row = view ? [...(view.buildings ?? []), ...(view.actions ?? [])].find((candidate) => candidate.id === actionId) : undefined;
  if (handleRefineryTileAction({ actionId, selected: input.selected, row, hideMenu: input.hideMenu })) return true;
  const type = structureTypeForTileAction(actionId);
  // Fortify / Siege rows open the tier picker; the chosen tier rides the normal build path.
  const tierRow = input.viewForTile?.(input.selected).buildings.find((candidate) => candidate.id === input.actionId);
  if (type && tierRow?.tierOptions?.length) {
    input.hideMenu();
    if (tierRow.disabled) return true;
    const selected = input.selected;
    (input.showTierSheet ?? showStructureTierSheet)({
      title: tierRow.label,
      subtitle: `Choose a tier for (${selected.x}, ${selected.y})`,
      options: tierRow.tierOptions,
      onPick: (option) => input.handleBuildAction(input.actionId, option.structureType, selected, option.tier)
    });
    return true;
  }
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
    input.handleBuildAction(input.actionId, type, input.selected);
    return true;
  }
  const warning = unmappedBuildActionWarning(actionId);
  if (!warning) return false;
  input.pushFeed(warning, "info", "error");
  input.hideMenu();
  return true;
};
