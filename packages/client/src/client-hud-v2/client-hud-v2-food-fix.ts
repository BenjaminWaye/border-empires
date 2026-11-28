// Performs the one-tap FOOD fix (primaryFoodFix in client-hud-v2-food-shortage.ts) from any warning that offers
// it: the tracker's "Short N FOOD", the town screen's unfed growth line and an unfed town's nameplate
// (client-food-fix-store.ts). The fix is worked out again from the tiles at tap time, so it never acts on a
// stale scan. Farm Plots queue through the normal build path; grain or fish is garrisoned (or expanded to) with
// the tile menu's own Garrison / Expand To action when that action is open to you now, else the map jumps to the
// tile with its menu open, showing why it can't be done.
import { pushFeed } from "../client-alerts/client-alerts.js";
import { focusCamera, screenCentre, type HudV2Deps } from "./client-hud-v2-context.js";
import { focusTileAndOpenMenu } from "./client-hud-v2-focus-tile.js";
import { queueFarmPlotsAndReport } from "./client-hud-v2-food-plots.js";
import { foodShortageForState, primaryFoodFix, scanFoodSources, type FoodFix } from "./client-hud-v2-food-shortage.js";

/** The fix for the current state, scanning the tiles now; undefined when FOOD isn't short or nothing in reach fixes it. */
export const currentFoodFix = (state: HudV2Deps["state"]): FoodFix | undefined =>
  primaryFoodFix(foodShortageForState(state, scanFoodSources(state)));

export type FoodFixOutcome = "garrison" | "expand" | "plots" | "shown" | "none";

/** Runs the fix; returns what it did ("shown": the tile's menu is open but its action wasn't available). */
export const runFoodFix = (deps: HudV2Deps): FoodFixOutcome => {
  const fix = currentFoodFix(deps.state);
  if (!fix) {
    pushFeed(deps.state, "No grain, fish or Farm Plot in reach", "info", "warn");
    deps.renderHud();
    return "none";
  }
  if (fix.kind === "plots") {
    queueFarmPlotsAndReport(deps, `${fix.x},${fix.y}`, fix.count);
    return "plots";
  }
  const key = `${fix.x},${fix.y}`;
  const tile = deps.state.tiles.get(key);
  const ready = tile ? deps.actionFlow.tileMenuViewForTile(tile).actions.some((action) => action.id === "settle_land" && !action.disabled) : false;
  if (!tile || !ready) {
    focusTileAndOpenMenu(deps, fix.x, fix.y);
    deps.renderHud();
    return "shown";
  }
  focusCamera(deps, fix.x, fix.y);
  const centre = screenCentre();
  deps.state.selected = { x: fix.x, y: fix.y };
  deps.actionFlow.openSingleTileActionMenu(tile, centre.x, centre.y);
  deps.actionFlow.handleTileAction("settle_land", key, undefined);
  deps.renderHud();
  return fix.kind;
};
