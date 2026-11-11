// Feeds the town screen's "Build plots" card from client state: the town's
// plots, with any queued build counted as taking its plot, and the plots a
// Place press just filled highlighted (see client-hud-v2-town-plots.ts).
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { createFreshPlotTracker, townBuildPlots, townPlotsStatHtml } from "./client-hud-v2-town-plots.js";

const trackFresh = createFreshPlotTracker();

export const townPlotsCardHtml = (state: Pick<ClientState, "tiles" | "me" | "developmentQueue">, town: Tile, nowMs = Date.now()): string => {
  const queued = new Set(state.developmentQueue.map((entry) => entry.tileKey));
  const plots = townBuildPlots(state.tiles, town, state.me, queued);
  return townPlotsStatHtml(plots, trackFresh(`${town.x},${town.y}`, plots, nowMs));
};
