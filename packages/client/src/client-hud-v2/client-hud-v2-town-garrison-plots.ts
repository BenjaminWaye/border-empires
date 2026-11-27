// The town screen's Garrison plots button (client-hud-v2-town.ts): queues a Garrison on every plot around
// the town you hold but haven't garrisoned. The plots are re-read at click time, not taken from the render.
import { pushFeed } from "../client-alerts/client-alerts.js";
import { garrisonableTownPlotsFor, garrisonTownPlots } from "../client-town-plot-garrison/client-town-plot-garrison.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";
import { renderTownScreen } from "./client-hud-v2-town-runtime.js";

/** Handles a Garrison plots press; false when `target` isn't that button. */
export const garrisonPlotsClick = (deps: HudV2Deps, target: Element): boolean => {
  const button = target.closest<HTMLButtonElement>("[data-v2-garrison-plots]");
  if (!button) return false;
  const town = deps.state.tiles.get(button.dataset.v2GarrisonPlots ?? "");
  const { requestSettlement, processDevelopmentQueue } = deps.actionFlow;
  if (button.disabled || !town || !requestSettlement || !processDevelopmentQueue) return true;
  const plots = garrisonableTownPlotsFor(deps.state, town);
  const queued = garrisonTownPlots(plots, requestSettlement, processDevelopmentQueue);
  const missed = plots.length - queued;
  pushFeed(deps.state, queued > 0 ? `Garrisoning ${queued} plot${queued === 1 ? "" : "s"}${missed > 0 ? `; ${missed} could not be queued` : ""}.` : "No plots could be garrisoned.", "combat", queued > 0 ? "info" : "warn");
  renderTownScreen(deps);
  deps.renderHud();
  return true;
};
