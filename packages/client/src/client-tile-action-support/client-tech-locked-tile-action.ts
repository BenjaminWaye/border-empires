import type { ClientState } from "../client-state/client-state.js";
import type { TileActionDef } from "../client-types.js";

export type TileActionFilterState = Pick<ClientState, "techIds" | "localhostDevAetherWall"> &
  Partial<Pick<ClientState, "tiles" | "me" | "techCatalog">>;

export const hideTechLockedTileAction = (
  action: TileActionDef,
  state: TileActionFilterState,
  requiredTechForTileAction: (actionId: TileActionDef["id"]) => string | undefined
): boolean => {
  if (action.id === "aether_wall" && state.localhostDevAetherWall) return false;
  const requiredTech = requiredTechForTileAction(action.id);
  if (requiredTech && !state.techIds.includes(requiredTech)) return true;
  const isModule = state.techCatalog?.find((tech) => tech.id === requiredTech)?.manifestCategory === "AFC_MODULE";
  if (requiredTech && isModule && state.tiles && state.me) {
    const installed = [...state.tiles.values()].some(
      (tile) => tile.ownerId === state.me && tile.ownershipState === "SETTLED" && tile.afc?.status === "active" && tile.afc.modules?.includes(requiredTech)
    );
    if (!installed) return true;
  }
  if (requiredTech) return false;
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};
