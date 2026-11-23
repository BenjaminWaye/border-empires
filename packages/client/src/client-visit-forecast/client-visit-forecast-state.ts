// Reads ClientState into the forecast's input (client-visit-forecast.ts). Every figure comes from a helper
// another screen already uses, so the forecast never disagrees with the orb, the tracker or the town screen.

import { deriveDevelopmentPanelData } from "../client-development-panel/client-development-html.js";
import { busyDevelopmentProcessCount } from "../client-development-queue/client-development-queue.js";
import { freshNextBatchAmount, msUntilManpowerFull, nextBatchGain, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import type { ClientState } from "../client-state/client-state.js";
import { displayTownPopulationTierLabel, isTownGrowthPaused } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";
import type { ForecastInput } from "./client-visit-forecast.js";

type ForecastState = Pick<
  ClientState,
  | "me" | "tiles" | "settleProgressByTile" | "developmentQueue" | "activeDevelopmentProcessCount" | "developmentProcessLimit" | "waypoint"
  | "manpower" | "manpowerCap" | "manpowerRegenPerMinute" | "nextManpowerBatchAmount" | "nextManpowerBatchAmountAt" | "seasonVictory" | "activeTruces"
>;

/** A town the player owns that is still growing toward a tier it can't buy yet; undefined otherwise. */
export const townReadyForecast = (tile: Tile, me: string, nowMs: number): ForecastInput["towns"][number] | undefined => {
  const town = tile.town;
  if (!town || tile.ownerId !== me || tile.ownershipState !== "SETTLED" || tile.fogged) return undefined;
  // Only the tier steps the server says are bought (Town to City and up) are forecast: it sends the population
  // each needs. A Settlement carries no such step, so nothing is promised about it.
  const upgrade = town.nextPopulationTierUpgrade;
  if (!upgrade || upgrade.available) return undefined;
  const required = upgrade.requiredPopulation;
  const nextTier = displayTownPopulationTierLabel(upgrade.targetTier);
  // Unfed, recently captured, nearby war or no growth: the town screen says "growth paused", so no time is promised.
  if (isTownGrowthPaused(town, { explainUnfed: true, nowMs })) return undefined;
  const growth = town.populationGrowthPerMinute ?? 0;
  const remaining = required - town.population;
  if (!(growth > 0) || !(remaining > 0)) return undefined;
  return { name: town.name ?? tile.townName ?? `Town ${tile.x}, ${tile.y}`, x: tile.x, y: tile.y, nextTier, readyInMs: (remaining / growth) * 60_000 };
};

/** `towns` is the player's town tiles (the HUD keeps that list; passing it avoids a scan of every tile). */
export const forecastInputForState = (state: ForecastState, towns: Iterable<Tile>, nowMs: number): ForecastInput => {
  const busy = Math.max(state.activeDevelopmentProcessCount, busyDevelopmentProcessCount(state.tiles.values(), state.me, state.settleProgressByTile.size));
  const development = deriveDevelopmentPanelData(state.tiles, state.me, state.settleProgressByTile, state.developmentQueue, busy, state.developmentProcessLimit);
  const nextRefillAt = nextManpowerRefillForPlayer(state.me, nowMs);
  const batch = freshNextBatchAmount(state.me, state.nextManpowerBatchAmount, state.nextManpowerBatchAmountAt, nowMs);
  const townRows: ForecastInput["towns"][number][] = [];
  for (const tile of towns) {
    const row = townReadyForecast(tile, state.me, nowMs);
    if (row) townRows.push(row);
  }
  return {
    active: development.activeSlots.map((slot) => ({ label: slot.label, x: slot.x, y: slot.y, remainingMs: slot.remainingMs, ...(slot.paused ? { paused: true } : {}) })),
    queued: development.queue.length,
    expansions: { total: state.waypoint.length, paused: state.waypoint.filter((waypoint) => Boolean(waypoint.pausedForManpower)).length },
    manpower: {
      current: state.manpower,
      cap: state.manpowerCap,
      fullInMs: nextRefillAt === undefined ? undefined : msUntilManpowerFull(state.manpower, state.manpowerCap, state.manpowerRegenPerMinute, nextRefillAt, nowMs),
      nextBatchInMs: nextRefillAt === undefined ? undefined : Math.max(0, nextRefillAt - nowMs),
      nextBatchGain: batch === undefined ? undefined : nextBatchGain(state.manpower, state.manpowerCap, batch)
    },
    towns: townRows,
    holds: state.seasonVictory
      .filter((objective) => objective.conditionMet && typeof objective.holdRemainingSeconds === "number" && objective.holdRemainingSeconds > 0)
      .map((objective) => ({ pathName: objective.name, holderName: objective.leaderName, mine: objective.leaderPlayerId === state.me, remainingMs: (objective.holdRemainingSeconds ?? 0) * 1000 })),
    truces: state.activeTruces.filter((truce) => truce.endsAt > nowMs).map((truce) => ({ name: truce.otherPlayerName, endsInMs: truce.endsAt - nowMs }))
  };
};
