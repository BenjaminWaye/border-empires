// Taps in the tracker's "Short N FOOD" section (client-hud-v2-food-shortage.ts): the header folds the fixes
// open and shut, and "Build N Farm Plots" queues them in one town and centres the map there, so the player
// sees them go up. Each plot goes through the same tile action as the town screen's Place
// (townPlotCandidates + handleTileAction), so it takes the paced development queue: builds past the Dev slot
// limit wait their turn, and the server checks every one again.
import { pushFeed } from "../client-alerts/client-alerts.js";
import { townTileOpenPlotReason, TOWN_PLOTS_TAKEN_REASON } from "../client-tile-action-logic/client-town-tile-support-gate.js";
import { focusCamera, screenCentre, type HudV2Deps } from "./client-hud-v2-context.js";
import { townPlotCandidates } from "./client-hud-v2-town-build-target.js";

type QueueDeps = Pick<HudV2Deps, "state" | "actionFlow">;

/** Queues up to `count` Farm Plots on this town's open plots; returns how many joined the queue. */
export const queueFarmPlots = (deps: QueueDeps, townKey: string, count: number, centre = screenCentre): number => {
  const { state } = deps;
  const town = state.tiles.get(townKey);
  if (!town) return 0;
  let queued = 0;
  while (queued < count) {
    const target = townPlotCandidates(deps, town, "build_farm_plot")[0];
    if (!target) break;
    const key = `${target.x},${target.y}`;
    const at = centre();
    state.selected = { x: target.x, y: target.y };
    deps.actionFlow.openSingleTileActionMenu(target, at.x, at.y);
    deps.actionFlow.handleTileAction("build_farm_plot", key, undefined);
    // A plot that didn't reach the queue would come back as the next candidate: stop rather than loop.
    if (!state.developmentQueue.some((entry) => entry.tileKey === key)) break;
    queued += 1;
  }
  deps.actionFlow.hideTileActionMenu();
  return queued;
};

const plots = (n: number): string => `${n} Farm Plot${n === 1 ? "" : "s"}`;

/** Handles a tap in the FOOD section; true when it consumed the tap. */
export const handleFoodShortageClick = (deps: HudV2Deps, target: Element, fold: { open: boolean }, repaint: () => void): boolean => {
  if (target.closest("[data-hud-v2-food-toggle]")) {
    fold.open = !fold.open;
    repaint();
    return true;
  }
  const row = target.closest<HTMLElement>("[data-hud-v2-food-plots]");
  const townKey = row?.dataset.hudV2FoodPlots;
  if (!row || !townKey) return false;
  const count = Number(row.dataset.hudV2FoodPlotsCount ?? "1");
  queueFarmPlotsAndReport(deps, townKey, Number.isFinite(count) ? count : 1);
  return true;
};

/** Queues the plots, says how many went in (or why none could), and centres the map on the town. */
export const queueFarmPlotsAndReport = (deps: HudV2Deps, townKey: string, count: number): void => {
  const queued = queueFarmPlots(deps, townKey, count);
  const town = deps.state.tiles.get(townKey);
  if (queued > 0) pushFeed(deps.state, `Queued ${plots(queued)}`, "info", "success");
  else pushFeed(deps.state, (town && townTileOpenPlotReason(deps.state, town)) ?? TOWN_PLOTS_TAKEN_REASON, "error", "warn");
  if (town) focusCamera(deps, town.x, town.y);
  deps.renderHud();
};
