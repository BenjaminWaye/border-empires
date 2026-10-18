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

// Same-tile resource builds stay visible (greyed out) while their tech is
// locked, naming the tech and linking to it instead of vanishing. A
// researched Umbrite Rigging Module that wasn't installed on an AFC used to
// hide the Umbrite Rig with no explanation at all. (An unresearched rig can't
// show up: the same tech reveals Umbrite on the map.)
const SHOWN_WHEN_TECH_LOCKED: ReadonlySet<TileActionDef["id"]> = new Set<TileActionDef["id"]>([
  "build_hydrogarden",
  "build_umbrite_rig",
  "build_mine"
]);

/**
 * What the tile menu shows for an action: undefined hides it, otherwise the
 * (possibly locked) row. A locked row is only shown when the tech, or
 * installing its module, is the one thing missing: any other blocker the
 * logic layer found (a structure already on the tile, no free slot) keeps the
 * row hidden as before, so the hint never promises a build that still can't happen.
 */
export const presentTechLockedTileAction = (
  action: TileActionDef,
  state: TileActionFilterState,
  requiredTechForTileAction: (actionId: TileActionDef["id"]) => string | undefined
): TileActionDef | undefined => {
  if (!hideTechLockedTileAction(action, state, requiredTechForTileAction)) return action;
  const requiredTech = requiredTechForTileAction(action.id);
  if (!requiredTech || !SHOWN_WHEN_TECH_LOCKED.has(action.id)) return undefined;
  const techName = state.techCatalog?.find((tech) => tech.id === requiredTech)?.name;
  if (!state.techIds.includes(requiredTech)) {
    // The logic layer checks for a blocking structure before the tech, so a
    // reason that isn't the tech's own "Requires ..." means the tile can't take this build.
    if (!action.disabledReason?.startsWith("Requires ")) return undefined;
    return { ...action, disabled: true, disabledReason: techName ? `Requires ${techName}` : action.disabledReason, techLinkId: requiredTech };
  }
  // Researched, but the AFC module isn't installed on an active AFC yet.
  if (action.disabled) return undefined;
  return { ...action, disabled: true, disabledReason: `Install ${techName ?? requiredTech} on an active AFC` };
};

/**
 * Opens the Manifest panel on one tech's detail card (desktop side panel, or
 * the mobile tech sheet). Sets panel state directly rather than via the
 * toggling setActivePanel, so it never closes an already-open panel. The
 * caller re-renders.
 */
export const openTechDetailFromTileMenu = (
  state: Pick<ClientState, "activePanel" | "mobilePanel" | "techUiSelectedId" | "techDetailOpen" | "domainDetailOpen">,
  techId: string,
  isMobileViewport: boolean
): void => {
  state.activePanel = "tech";
  if (isMobileViewport) state.mobilePanel = "tech";
  state.techUiSelectedId = techId;
  state.techDetailOpen = true;
  state.domainDetailOpen = false;
};
