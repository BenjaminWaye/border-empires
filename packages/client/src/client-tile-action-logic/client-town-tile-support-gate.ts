// Why a support-ring building (Manufactory, Incubation Engine, refineries...)
// can't be ordered from this tile right now, or undefined when it can.
//
// On a support tile the only local blocker is a structure already standing
// there. On the town tile itself the building never goes on the town: the town
// screen's Place picks an open support plot (client-hud-v2-town-build-target.ts)
// and the server does the same (resolveTownSupportTarget in apps/simulation/src/
// runtime-structure-town-support-target.ts). With no open plot that press used
// to do nothing at all, so the row is disabled here with the reason instead.
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { townBuildPlots } from "../client-hud-v2/client-hud-v2-town-plots.js";

export const TOWN_PLOT_NEEDS_GARRISON_REASON = "Garrison a tile next to this town first";
export const TOWN_PLOTS_TAKEN_REASON = "No open build plot next to this town";

/** The town tile's reason when none of its support plots can take a building, or undefined when one can. */
export const townTileOpenPlotReason = (state: Pick<ClientState, "tiles" | "me">, town: Tile): string | undefined => {
  const plots = townBuildPlots(state.tiles, town, state.me, new Set());
  // No known ground around the town (not loaded yet): leave it to the server rather than guess.
  if (!plots || plots.length === 0 || plots.some((plot) => plot.state === "open")) return undefined;
  return plots.some((plot) => plot.state === "locked") ? TOWN_PLOT_NEEDS_GARRISON_REASON : TOWN_PLOTS_TAKEN_REASON;
};

export const supportPlacementBlockedReason = (
  state: Pick<ClientState, "tiles" | "me">,
  tile: Tile,
  townBuildSource: Tile | undefined,
  hasBlockingStructure: boolean
): string | undefined => {
  if (!townBuildSource) return undefined;
  if (townBuildSource !== tile) return hasBlockingStructure ? "Tile already has structure" : undefined;
  return townTileOpenPlotReason(state, tile);
};
