import { isTownSupportPlacementStructure, landmarkConstructionBlocker, STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES, type AfcRecoveryState } from "@border-empires/shared";
import { structureTypeForTileAction } from "../client-tile-action-support/client-build-action-dispatch.js";
import type { Tile, TileActionDef } from "../client-types.js";

/** Keep fabrication actions visible with the same explanation as the recovery popup. */
export function gateAfcConstructionActions(actions: TileActionDef[], recovery: AfcRecoveryState | undefined): TileActionDef[] {
  if (recovery?.requiredSince === undefined) return actions;
  return actions.map(action => action.id.startsWith("build_") && action.id !== "build_afc"
    ? { ...action, disabled: true, disabledReason: "Call down a new AFC to continue construction" }
    : action);
}

/** Shared tile menu rule for both map renderers. AFC commissioning opens a separate placement flow. */
export function gateTileConstructionActions(
  actions: TileActionDef[],
  state: { afcRecovery?: AfcRecoveryState | undefined; tiles?: ReadonlyMap<string, Tile> | undefined },
  tile: Tile
): TileActionDef[] {
  const blocker = state.tiles && landmarkConstructionBlocker(state.tiles, tile.x, tile.y);
  const gatedActions = gateAfcConstructionActions(actions, state.afcRecovery);
  if (!blocker) return gatedActions;
  const disabledReason = blocker === "AFC" ? "This tile is reserved by an AFC" : "This tile is reserved by a relic";
  return gatedActions.map(action => {
    if (!action.id.startsWith("build_") || action.id === "build_afc") return action;
    if (tile.town) {
      const type = structureTypeForTileAction(action.id);
      if (type && (isTownSupportPlacementStructure(type) || STACKING_SAME_TILE_SUPPORT_STRUCTURE_TYPES.has(type))) return action;
    }
    return { ...action, disabled: true, disabledReason };
  });
}
