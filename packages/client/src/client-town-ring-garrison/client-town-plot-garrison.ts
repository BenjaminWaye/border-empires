// Garrisoning a garrisoned town's plots (its support ring), two ways:
//   - "Garrison N plots" in the town's tile menu: every plot the town screen's Garrison plots button takes.
//   - Growing the town: Settlement -> Town opens the ring and Town -> City widens it to radius 2. The server
//     claims the new outer plots on the upgrade (handleUpgradeTownTierCommand -> autoClaimFrontier), but only
//     garrisons them when the player's "towns" auto-garrison switch is on. Growing now garrisons the new plots
//     either way, the same as a town's own Garrison garrisons its ring (client-town-ring-garrison.ts).
import { DEV_QUEUE_TOTAL_CAP, SETTLE_COST, isAutoSettleAllowedForTile, supportRingCandidates, supportRingRadiusForTier } from "@border-empires/shared";
import { canAffordCost } from "../client-constants.js";
import { queuedDevelopmentActionExists } from "../client-development-queue/client-development-queue.js";
import type { ClientState } from "../client-state/client-state.js";
import { garrisonableTownPlotsFor } from "../client-town-plot-garrison/client-town-plot-garrison.js";
import { tileActionAvailability } from "../client-tile-action-logic/client-tile-action-availability.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { TOWN_RING_GARRISON_MAX_ENTRIES } from "./client-town-ring-garrison.js";

/** Re-exported so client-action-flow.ts (over the line budget) takes both town Garrison entry points in one import. */
export { requestGarrisonWithTownRing } from "./client-town-ring-garrison.js";

const keyOf = (tile: Pick<Tile, "x" | "y">): string => `${tile.x},${tile.y}`;

const GROW_ACTION_IDS = new Set(["grow_settlement_to_town", "grow_town_to_city", "grow_city_to_great_city", "grow_great_city_to_monumental_city"]);
const NEXT_TIER: Record<string, string> = { SETTLEMENT: "TOWN", TOWN: "CITY", CITY: "GREAT_CITY", GREAT_CITY: "METROPOLIS" };

type PlotState = Pick<ClientState, "tiles" | "me" | "settleProgressByTile" | "developmentQueue">;

const isSettling = (state: PlotState, key: string): boolean =>
  state.settleProgressByTile.has(key) || queuedDevelopmentActionExists(state as ClientState, key, "SETTLE");

const isOwnGarrisonedTown = (state: Pick<ClientState, "me">, town: Tile): boolean =>
  Boolean(town.town) && town.ownerId === state.me && town.ownershipState === "SETTLED";

/** "Garrison N plots" for a garrisoned town with any plot left to garrison, else undefined. */
export const garrisonTownPlotsAction = (state: ClientState, town: Tile): TileActionDef | undefined => {
  if (!isOwnGarrisonedTown(state, town)) return undefined;
  const count = garrisonableTownPlotsFor(state, town).length;
  if (count === 0) return undefined;
  const coin = count * SETTLE_COST;
  const cost = `${coin > 0 ? `${coin} coin, ` : ""}${count * state.settleManpowerCost} manpower`;
  // Each plot is queued (forceQueue), so short manpower only makes it wait; a full queue or no coin drops it.
  const room = Math.max(0, DEV_QUEUE_TOTAL_CAP - state.developmentQueue.length);
  const blocked = count > room ? `Queue has room for ${room} more` : !canAffordCost(state.gold, SETTLE_COST) ? `Need ${SETTLE_COST} coin` : "";
  return {
    id: "garrison_town_plots",
    label: `Garrison ${count} plot${count === 1 ? "" : "s"}`,
    detail: "Garrison every claimed plot around this town.",
    ...tileActionAvailability(!blocked, blocked, cost)
  };
};

/**
 * Plots `town` gains by growing one tier: land in the new ring but not the old one that is your FRONTIER, or
 * neutral ground no rival's border covers (the server claims it on the upgrade). Empty when the ring doesn't grow.
 */
export const plotsGainedByGrowth = (state: PlotState, town: Tile): Tile[] => {
  const tier = town.town?.populationTier;
  const nextTier = tier ? NEXT_TIER[tier] : undefined;
  const from = supportRingRadiusForTier(tier);
  const to = supportRingRadiusForTier(nextTier);
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

/**
 * Remember to garrison the plots growth adds. processTownRingGarrisons waits until the town shows the new tier
 * (a rejected upgrade garrisons nothing), then sends each SETTLE once the plot is your FRONTIER.
 */
const registerGrowthPlots = (state: ClientState, town: Tile, now: number): void => {
  const nextTier = town.town?.populationTier ? NEXT_TIER[town.town.populationTier] : undefined;
  if (!nextTier) return;
  // Plots the server auto-garrisons (their own switch -- "towns", or the plot's resource -- is on) are left to it.
  const prefs = state.autoSettle.status === "loaded" ? state.autoSettle.prefs : undefined;
  const ringKeys = plotsGainedByGrowth(state, town).filter((tile) => !prefs || !isAutoSettleAllowedForTile(prefs, tile)).map(keyOf);
  if (ringKeys.length === 0) return;
  const townKey = keyOf(town);
  // Keep any ring tiles a pending Garrison of this town is still waiting on; they now wait for the upgrade too.
  const pending = state.townRingGarrisons.get(townKey)?.ringKeys ?? [];
  state.townRingGarrisons.delete(townKey);
  while (state.townRingGarrisons.size >= TOWN_RING_GARRISON_MAX_ENTRIES) {
    const oldest = state.townRingGarrisons.keys().next().value;
    if (oldest === undefined) break;
    state.townRingGarrisons.delete(oldest);
  }
  state.townRingGarrisons.set(townKey, { ringKeys: [...new Set([...pending, ...ringKeys])], startedAt: now, awaitTier: nextTier });
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
  // The same plots the town screen's Garrison plots button takes (client-town-plot-garrison/).
  for (const plot of garrisonableTownPlotsFor(deps.state, town)) {
    deps.requestSettlement(plot.x, plot.y, { forceQueue: true, suppressWarnings: true });
  }
  return true;
};
