// Plots around a garrisoned town that you hold but haven't garrisoned yet. The town screen offers one
// Garrison plots button for them and the town's nameplate shows the garrison badge while any are left.
// Only plots a Garrison could start on now count: your own FRONTIER land, inside your reach, not
// already garrisoning or queued. Rival or neutral land in the ring (enemy territory) never does.
import { SETTLE_COST, garrisonBlockedByReach, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { canAffordCost } from "../client-constants.js";
import { garrisonPlannedTileKeys } from "../client-town-growth/client-town-growth.js";
import { resolveMyReachCached, type ReachCacheState } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";

type TileKeys = { has(key: string): boolean };

const keyOf = (tile: Pick<Tile, "x" | "y">): string => `${tile.x},${tile.y}`;

/** Your plots around `town` that a Garrison could start on now; empty unless the town is yours, garrisoned and past Settlement. */
export const garrisonableTownPlots = (
  tiles: ReadonlyMap<string, Tile>,
  me: string,
  town: Tile,
  garrisoning: TileKeys,
  reach: TileKeys
): Tile[] => {
  const tier = town.town?.populationTier;
  if (!tier || tier === "SETTLEMENT" || !me || town.ownerId !== me || town.ownershipState !== "SETTLED") return [];
  return supportRingCandidates(tiles, town.x, town.y, supportRingRadiusForTier(tier))
    .map(({ tile }) => tile)
    .filter((tile) =>
      tile.terrain === "LAND" &&
      !tile.town &&
      !tile.fogged &&
      tile.ownerId === me &&
      tile.ownershipState === "FRONTIER" &&
      !tile.optimisticPending &&
      !garrisoning.has(keyOf(tile)) &&
      !garrisonBlockedByReach(tile, reach.has(keyOf(tile))));
};

type PlotState = ReachCacheState & Pick<ClientState, "developmentQueue" | "settleProgressByTile" | "autoSettleTargets">;

/** garrisonableTownPlots against the live client state (planned garrisons and your current reach). */
export const garrisonableTownPlotsFor = (state: PlotState, town: Tile): Tile[] =>
  garrisonableTownPlots(state.tiles as ReadonlyMap<string, Tile>, state.me, town, garrisonPlannedTileKeys(state), resolveMyReachCached(state));

/** For the nameplates: one predicate per frame, so planned garrisons and reach are resolved once, not per town. */
export const townHasPlotsToGarrison = (state: PlotState): ((town: Tile) => boolean) => {
  const garrisoning = garrisonPlannedTileKeys(state);
  const reach = resolveMyReachCached(state);
  return (town) => garrisonableTownPlots(state.tiles as ReadonlyMap<string, Tile>, state.me, town, garrisoning, reach).length > 0;
};

export type TownPlotGarrison = { count: number; cost: string; disabledReason?: string };

/** The town screen's Garrison plots button: how many, what it costs, and why it can't start yet. */
export const townPlotGarrison = (
  plots: readonly Tile[],
  state: Pick<ClientState, "gold" | "settleManpowerCost">
): TownPlotGarrison | undefined => {
  if (plots.length === 0) return undefined;
  const coin = plots.length * SETTLE_COST;
  const cost = `${plots.length} plot${plots.length === 1 ? "" : "s"} · ${coin > 0 ? `${coin} coin, ` : ""}${plots.length * state.settleManpowerCost} manpower`;
  // Short on manpower still queues (each waits for a refill batch); short on coin is refused.
  return canAffordCost(state.gold, SETTLE_COST) ? { count: plots.length, cost } : { count: plots.length, cost, disabledReason: `Need ${SETTLE_COST} coin` };
};

/** Queues a Garrison on each plot (the development queue paces them); returns how many were queued. */
export const garrisonTownPlots = (
  plots: readonly Tile[],
  requestSettlement: (x: number, y: number, opts: { forceQueue: true; suppressWarnings: true }) => boolean,
  processDevelopmentQueue: () => void
): number => {
  let queued = 0;
  for (const plot of plots) if (requestSettlement(plot.x, plot.y, { forceQueue: true, suppressWarnings: true })) queued += 1;
  if (queued > 0) processDevelopmentQueue();
  return queued;
};
