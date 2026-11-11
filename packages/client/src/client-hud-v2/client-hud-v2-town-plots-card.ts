// Feeds the town screen's "Build plots" card from client state: the town's
// plots, with any queued build or garrison counted as taking its plot, and the plots a
// Place press just filled highlighted (see client-hud-v2-town-plots.ts).
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { createFreshPlotTracker, townBuildPlots, townPlotsStatHtml } from "./client-hud-v2-town-plots.js";

const trackFresh = createFreshPlotTracker();

export const townPlotsCardHtml = (state: Pick<ClientState, "tiles" | "me" | "developmentQueue" | "settleProgressByTile" | "autoSettleTargets">, town: Tile, nowMs = Date.now()): string => {
  // Queued builds and garrisons, and garrisons under way: the plot is spoken for.
  const inProgress = new Set([...state.developmentQueue.map((entry) => entry.tileKey), ...state.settleProgressByTile.keys(), ...state.autoSettleTargets]);
  const plots = townBuildPlots(state.tiles, town, state.me, inProgress);
  return townPlotsStatHtml(plots, trackFresh(`${town.x},${town.y}`, plots, nowMs));
};
