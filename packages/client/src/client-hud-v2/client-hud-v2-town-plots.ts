// Town screen "Build plots" card: one pip per support-ring plot this town
// owns, so a placed building visibly fills a plot. Replaces the old
// "Support ring 8/8" number, which said nothing once the ring was full.
// A plot is open on the same terms as openBuildSlotsForTown (the town list's
// count, mirroring the simulation's openTownSupportNeighborTiles), and is
// busy while a build is under construction, optimistic or queued on it, or
// while the plot is being garrisoned.
import { landmarkConstructionBlocker, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { assignedTownForSupportTile } from "../client-support-structures/client-support-structures.js";
import type { Tile } from "../client-types.js";

export type TownPlotState = "built" | "building" | "open" | "locked";

export type TownPlot = { key: string; state: TownPlotState };

const structureStatus = (tile: Tile): string | undefined => {
  const structure = tile.fort ?? tile.observatory ?? tile.siegeBattery ?? tile.economicStructure;
  return structure ? (structure as { status?: string }).status ?? "active" : undefined;
};

/**
 * This town's support plots in ring order, or undefined while it is a Settlement (no support ring yet).
 * Only ground this player could ever build on counts: sea, mountains, tiles another player holds and
 * landmark-blocked tiles are left out, like openBuildSlotsForTown. `inProgressTileKeys` are tiles with a
 * queued build or garrison, or a garrison under way: they read as in progress, not "needs garrison".
 */
export const townBuildPlots = (
  tiles: ReadonlyMap<string, Tile>,
  town: Tile,
  me: string,
  inProgressTileKeys: ReadonlySet<string>
): TownPlot[] | undefined => {
  const tier = town.town?.populationTier;
  if (!tier || tier === "SETTLEMENT") return undefined;
  const plots: TownPlot[] = [];
  for (const { tile } of supportRingCandidates(tiles, town.x, town.y, supportRingRadiusForTier(tier))) {
    if (tile.town || tile.terrain !== "LAND") continue;
    if (tile.ownerId && tile.ownerId !== me) continue;
    if (landmarkConstructionBlocker(tiles, tile.x, tile.y)) continue;
    const assigned = assignedTownForSupportTile(tiles, tile, me);
    if (assigned?.x !== town.x || assigned.y !== town.y) continue;
    const key = `${tile.x},${tile.y}`;
    const status = tile.ownerId === me ? structureStatus(tile) : undefined;
    const pending = inProgressTileKeys.has(key) || tile.optimisticPending === "structure_build" || tile.optimisticPending === "settle";
    let state: TownPlotState;
    if (tile.ownerId === me && tile.afc) state = "built";
    else if (status) state = status === "under_construction" || tile.optimisticPending === "structure_build" ? "building" : "built";
    else if (pending) state = "building";
    else state = tile.ownerId === me && tile.ownershipState === "SETTLED" ? "open" : "locked";
    plots.push({ key, state });
  }
  return plots;
};

const PLOT_TITLES: Record<TownPlotState, string> = {
  built: "Built",
  building: "In progress: building, queued or garrisoning",
  open: "Open for a building",
  locked: "Claim and garrison this tile to open it"
};

const count = (plots: readonly TownPlot[], state: TownPlotState): number => plots.filter((p) => p.state === state).length;

const FRESH_MS = 3_000;

/**
 * Remembers which plots were open on the last render of a town, so a plot taken since (pressing Place)
 * is marked fresh for a few seconds -- long enough to survive the re-renders that follow.
 */
export const createFreshPlotTracker = () => {
  let townKey: string | undefined;
  let previous = new Map<string, TownPlotState>();
  const freshUntil = new Map<string, number>();
  return (key: string, plots: readonly TownPlot[] | undefined, nowMs: number): ReadonlySet<string> => {
    if (key !== townKey) { townKey = key; previous = new Map(); freshUntil.clear(); }
    for (const plot of plots ?? []) {
      if (previous.get(plot.key) === "open" && (plot.state === "building" || plot.state === "built")) freshUntil.set(plot.key, nowMs + FRESH_MS);
      if (plot.state === "open") freshUntil.delete(plot.key);
    }
    previous = new Map((plots ?? []).map((plot) => [plot.key, plot.state]));
    for (const [plotKey, until] of freshUntil) if (until <= nowMs) freshUntil.delete(plotKey);
    return new Set(freshUntil.keys());
  };
};

/** The card's value, pips and note. A `fresh` plot (just taken by a Place press) is highlighted, so you see where the building went. */
export const townPlotsStatHtml = (plots: readonly TownPlot[] | undefined, fresh: ReadonlySet<string> = new Set()): string => {
  if (!plots) {
    return `<div class="v2t-stat v2t-plots"><span class="v2t-stat-k">BUILD PLOTS</span><span class="v2t-stat-v">—</span><span class="v2t-stat-n">Grow to a Town for a support ring</span></div>`;
  }
  const open = count(plots, "open");
  const building = count(plots, "building");
  const built = count(plots, "built");
  const locked = count(plots, "locked");
  const pips = plots.map((p) => `<span class="v2t-plot v2t-plot-${p.state}${fresh.has(p.key) ? " v2t-plot-new" : ""}" title="${PLOT_TITLES[p.state]}"></span>`).join("");
  const note = [`${built} built`, building > 0 ? `${building} in progress` : "", locked > 0 ? `${locked} to garrison` : ""].filter(Boolean).join(" · ");
  // "Full" only once nothing is left to garrison: with plots still to garrison it read as "can never build here".
  const value = open > 0 ? `${open} open` : locked > 0 ? "0 open" : plots.length > 0 ? "Full" : "None";
  return `<div class="v2t-stat v2t-plots${fresh.size > 0 ? " v2t-plots-changed" : ""}"><span class="v2t-stat-k">BUILD PLOTS</span><span class="v2t-stat-v${open > 0 ? " v2t-gold" : ""}">${value}</span><span class="v2t-plot-row" aria-label="${open} of ${plots.length} plots open">${pips}</span><span class="v2t-stat-n">${note}</span></div>`;
};
