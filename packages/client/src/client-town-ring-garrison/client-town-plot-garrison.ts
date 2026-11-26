// Garrisoning a garrisoned town's plots (its support ring), two ways:
//   - "Garrison N plots" on the town: every claimed, ungarrisoned plot in reach, in one click.
//   - Growing the town: Settlement -> Town opens the ring and Town -> City widens it to radius 2. The server
//     claims the new outer plots on the upgrade (handleUpgradeTownTierCommand -> autoClaimFrontier), but only
//     garrisons them when the player's "towns" auto-garrison switch is on. Growing now garrisons the new plots
//     either way, the same as a town's own Garrison garrisons its ring (client-town-ring-garrison.ts).
import { SETTLE_COST, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { queuedDevelopmentActionExists } from "../client-development-queue/client-development-queue.js";
import { resolveMyReachCached } from "../client-reach-authoritative/client-reach-authoritative.js";
import type { ClientState } from "../client-state/client-state.js";
import { tileActionAvailability } from "../client-tile-action-logic/client-tile-action-availability.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { TOWN_RING_GARRISON_MAX_ENTRIES } from "./client-town-ring-garrison.js";

/** Re-exported so client-action-flow.ts (over the line budget) takes both town Garrison entry points in one import. */
export { requestGarrisonWithTownRing } from "./client-town-ring-garrison.js";

const keyOf = (tile: Pick<Tile, "x" | "y">): string => `${tile.x},${tile.y}`;

const GROW_ACTION_IDS = new Set(["grow_settlement_to_town", "grow_town_to_city", "grow_city_to_great_city", "grow_great_city_to_monumental_city"]);
const NEXT_TIER: Record<string, string> = { SETTLEMENT: "TOWN", TOWN: "CITY", CITY: "GREAT_CITY", GREAT_CITY: "METROPOLIS" };

/** A Settlement has no plots yet; every other tier's ring is supportRingRadiusForTier. */
const plotRadius = (tier: string | undefined): number => (!tier || tier === "SETTLEMENT" ? 0 : supportRingRadiusForTier(tier));

type PlotState = Pick<ClientState, "tiles" | "me" | "settleProgressByTile" | "developmentQueue">;

const isSettling = (state: PlotState, key: string): boolean =>
  state.settleProgressByTile.has(key) || queuedDevelopmentActionExists(state as ClientState, key, "SETTLE");

const isOwnGarrisonedTown = (state: Pick<ClientState, "me">, town: Tile): boolean =>
  Boolean(town.town) && town.ownerId === state.me && town.ownershipState === "SETTLED";

/** This town's claimed, ungarrisoned plots that a SETTLE can take now: your in-reach FRONTIER land, not already settling. */
export const townPlotsToGarrison = (state: PlotState, town: Tile, reach: { has: (key: string) => boolean }): Tile[] => {
  if (!isOwnGarrisonedTown(state, town)) return [];
  return supportRingCandidates(state.tiles, town.x, town.y, plotRadius(town.town?.populationTier))
    .map(({ tile }) => tile)
    .filter((tile) => {
      const key = keyOf(tile);
      return tile.terrain === "LAND" && tile.ownerId === state.me && tile.ownershipState === "FRONTIER" && !tile.optimisticPending && reach.has(key) && !isSettling(state, key);
    });
};

/** "Garrison N plots" for a garrisoned town with any plot left to garrison, else undefined. */
export const garrisonTownPlotsAction = (state: ClientState, town: Tile): TileActionDef | undefined => {
  const count = townPlotsToGarrison(state, town, resolveMyReachCached(state)).length;
  if (count === 0) return undefined;
  const coin = count * SETTLE_COST;
  const cost = `${coin > 0 ? `${coin} coin, ` : ""}${count * state.settleManpowerCost} manpower`;
  return {
    id: "garrison_town_plots",
    label: `Garrison ${count} plot${count === 1 ? "" : "s"}`,
    detail: "Garrison every claimed plot around this town.",
    ...tileActionAvailability(state.manpower >= state.settleManpowerCost, `Need ${state.settleManpowerCost} manpower`, cost)
  };
};

/**
 * Plots `town` gains by growing one tier: land in the new ring but not the old one that is your FRONTIER, or
 * neutral ground no rival's border covers (the server claims it on the upgrade). Empty when the ring doesn't grow.
 */
export const plotsGainedByGrowth = (state: PlotState, town: Tile): Tile[] => {
  const tier = town.town?.populationTier;
  const nextTier = tier ? NEXT_TIER[tier] : undefined;
  const from = plotRadius(tier);
  const to = plotRadius(nextTier);
  if (!isOwnGarrisonedTown(state, town) || to <= from) return [];
  return supportRingCandidates(state.tiles, town.x, town.y, to)
    .filter(({ dx, dy }) => Math.max(Math.abs(dx), Math.abs(dy)) > from)
    .map(({ tile }) => tile)
    .filter((tile) => {
      if (tile.terrain !== "LAND") return false;
      if (!tile.ownerId) return !tile.reachOwnerId || tile.reachOwnerId === state.me;
      return tile.ownerId === state.me && tile.ownershipState === "FRONTIER" && !isSettling(state, keyOf(tile));
    });
};

type TownPlotActionDeps = {
  state: ClientState;
  sendGameMessage: (message: { type: "UPGRADE_TOWN_TIER"; x: number; y: number }) => void;
  requestSettlement: (x: number, y: number, opts: { forceQueue: true; suppressWarnings: true }) => boolean;
  now: number;
};

/** Remember to garrison the plots growth adds; processTownRingGarrisons sends each SETTLE once the plot is your FRONTIER. */
const registerGrowthPlots = (state: ClientState, town: Tile, now: number): void => {
  // With the "towns" switch on the server garrisons them itself; a second SETTLE would only be rejected.
  if (state.autoSettle.status === "loaded" && state.autoSettle.prefs.towns) return;
  const ringKeys = plotsGainedByGrowth(state, town).map(keyOf);
  if (ringKeys.length === 0) return;
  const townKey = keyOf(town);
  state.townRingGarrisons.delete(townKey);
  while (state.townRingGarrisons.size >= TOWN_RING_GARRISON_MAX_ENTRIES) {
    const oldest = state.townRingGarrisons.keys().next().value;
    if (oldest === undefined) break;
    state.townRingGarrisons.delete(oldest);
  }
  // The town is already garrisoned, so the after-settle window starts now and covers the upgrade's round trip.
  state.townRingGarrisons.set(townKey, { ringKeys, startedAt: now, townSettledAt: now });
};

/**
 * Town growth and "Garrison N plots". Returns true when `actionId` was the plots action (fully handled); a growth
 * action sends UPGRADE_TOWN_TIER and returns false, so the caller's later handlers still see it as before.
 */
export const handleTownPlotAction = (actionId: string, town: Tile, deps: TownPlotActionDeps): boolean => {
  if (GROW_ACTION_IDS.has(actionId)) {
    registerGrowthPlots(deps.state, town, deps.now);
    deps.sendGameMessage({ type: "UPGRADE_TOWN_TIER", x: town.x, y: town.y });
    return false;
  }
  if (actionId !== "garrison_town_plots") return false;
  for (const plot of townPlotsToGarrison(deps.state, town, resolveMyReachCached(deps.state))) {
    deps.requestSettlement(plot.x, plot.y, { forceQueue: true, suppressWarnings: true });
  }
  return true;
};
