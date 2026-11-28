import { NETWORK_RESOURCES, networkBuildAction } from "@border-empires/shared";
import type { ClientState } from "../client-state/client-state.js";
import type { TileActionDef } from "../client-types.js";
import { afcModuleInstalled } from "../client-afc-module-access/client-afc-module-access.js";

export type TileActionFilterState = Pick<ClientState, "techIds" | "localhostDevAetherWall"> &
  Partial<Pick<ClientState, "tiles" | "me" | "techCatalog" | "domainIds" | "tilesRevision">>;

/** Re-exported: an AFC_MODULE tech only works while a copy sits on one of the player's active, settled AFCs (the server's build gate). */
export { afcModuleInstalled } from "../client-afc-module-access/client-afc-module-access.js";

export const hideTechLockedTileAction = (
  action: TileActionDef,
  state: TileActionFilterState,
  requiredTechForTileAction: (actionId: TileActionDef["id"]) => string | undefined
): boolean => {
  if (action.id === "aether_wall" && state.localhostDevAetherWall) return false;
  const requiredTech = requiredTechForTileAction(action.id);
  // An installed module copy -- researched or captured with the AFC -- unlocks its builds and abilities without research.
  if (requiredTech && state.tiles && state.me && afcModuleInstalled({ tiles: state.tiles, me: state.me, ...(state.tilesRevision === undefined ? {} : { tilesRevision: state.tilesRevision }) }, requiredTech)) return false;
  if (requiredTech && !state.techIds.includes(requiredTech)) return true;
  const isModule = state.techCatalog?.find((tech) => tech.id === requiredTech)?.manifestCategory === "AFC_MODULE";
  if (requiredTech && isModule && state.tiles && state.me) return true;
  if (requiredTech) return false;
  if (!action.disabled || !action.disabledReason) return false;
  return /^Requires\b/i.test(action.disabledReason) || /^Need reveal capability\b/i.test(action.disabledReason);
};

// Same-tile resource builds stay visible (greyed out) while their tech is
// locked, naming the tech and linking to it instead of vanishing.
const SHOWN_WHEN_TECH_LOCKED: ReadonlySet<TileActionDef["id"]> = new Set<TileActionDef["id"]>([
  ...NETWORK_RESOURCES.map(networkBuildAction),
  "build_hydrogarden",
  "build_hydrogarden_plot"
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
 * A building the tile menu hides for want of research (presentTechLockedTileAction returned undefined), as a
 * greyed row naming the research and linking to it. Only the town screen lists these: players never saw what a
 * town could grow into, because locked buildings were hidden (owner, First-15 round 1). Undefined when the row is
 * hidden for another reason (a structure already on the tile, a building the town already has) or when nothing
 * the player can research unlocks it.
 */
export const techLockedBuildingRow = (
  action: TileActionDef,
  state: TileActionFilterState,
  requiredTechForTileAction: (actionId: TileActionDef["id"]) => string | undefined
): TileActionDef | undefined => {
  const requiredTech = requiredTechForTileAction(action.id);
  if (!requiredTech || state.techIds.includes(requiredTech)) return undefined;
  // The logic layer checks other blockers before the tech, so a reason that isn't a "Requires ..." means more than research is missing.
  if (action.disabled && !action.disabledReason?.startsWith("Requires ")) return undefined;
  const techName = state.techCatalog?.find((tech) => tech.id === requiredTech)?.name;
  const reason = techName ? `Requires ${techName}` : action.disabledReason;
  if (!reason) return undefined;
  return { ...action, disabled: true, disabledReason: reason, techLinkId: requiredTech };
};

/**
 * Opens the Manifest panel on one tech's detail card (desktop side panel, or
 * the mobile tech sheet). Sets panel state directly rather than via the
 * toggling setActivePanel, so it never closes an already-open panel. The
 * caller re-renders.
 */
export const openTechDetailFromTileMenu = (
  state: Pick<ClientState, "activePanel" | "techUiSelectedId" | "techDetailOpen" | "domainDetailOpen">,
  techId: string
): void => {
  state.activePanel = "tech";
  state.techUiSelectedId = techId;
  state.techDetailOpen = true;
  state.domainDetailOpen = false;
};
