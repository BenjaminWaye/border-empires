// Reads ClientState into the agenda's input (client-visit-agenda.ts), with the same checks the map badges,
// the Towns screen and the tracker use, so the agenda never lists something those screens would not offer.

import { spendableCoin } from "@border-empires/shared";
import { readyAfcUpgradeCount, type AfcUpgradeReadiness } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import { deriveDevelopmentPanelData } from "../client-development-panel/client-development-html.js";
import { busyDevelopmentProcessCount } from "../client-development-queue/client-development-queue.js";
import { manifestNodeState } from "../client-hud-v2/client-hud-v2-manifest.js";
import { freshNextBatchAmount, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import type { ClientState } from "../client-state/client-state.js";
import { displayTownPopulationTierLabel, garrisonPlannedTileKeys, isOwnTownUngarrisoned, shouldShowTownUnfedWarning, shouldShowTownUpgradeReadyBadge } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";
import type { AgendaInput, AgendaTown } from "./client-visit-agenda.js";

type AgendaState = Omit<AfcUpgradeReadiness, "techCatalog" | "techIds" | "me" | "gold"> & Parameters<typeof garrisonPlannedTileKeys>[0] & Pick<
  ClientState,
  | "me" | "tiles" | "settleProgressByTile" | "developmentQueue" | "activeDevelopmentProcessCount" | "developmentProcessLimit"
  | "manpower" | "manpowerCap" | "nextManpowerBatchAmount" | "nextManpowerBatchAmountAt" | "gold" | "techCatalog" | "techIds" | "techChoices"
>;

/** A town's agenda facts, or undefined when nothing about it needs a decision. */
export const agendaTown = (tile: Tile, me: string, garrisoning?: { has(key: string): boolean }): AgendaTown | undefined => {
  const town = tile.town;
  if (!town || tile.ownerId !== me || tile.fogged) return undefined;
  const ungarrisoned = isOwnTownUngarrisoned(tile, me, garrisoning);
  const unfed = shouldShowTownUnfedWarning(tile, me);
  const upgrade = shouldShowTownUpgradeReadyBadge(tile, me) ? town.nextPopulationTierUpgrade : undefined;
  if (!ungarrisoned && !unfed && !upgrade) return undefined;
  return {
    name: town.name ?? tile.townName ?? `Town ${tile.x}, ${tile.y}`, x: tile.x, y: tile.y, ungarrisoned, unfed,
    ...(upgrade ? { upgrade: { tier: displayTownPopulationTierLabel(upgrade.targetTier), goldCost: upgrade.goldCost } } : {})
  };
};

/** `towns` is the player's town tiles (the HUD keeps that list; passing it avoids a scan of every tile). */
export const agendaInputForState = (state: AgendaState, towns: Iterable<Tile>, nowMs: number): AgendaInput => {
  const busy = Math.max(state.activeDevelopmentProcessCount, busyDevelopmentProcessCount(state.tiles.values(), state.me, state.settleProgressByTile.size));
  const development = deriveDevelopmentPanelData(state.tiles, state.me, state.settleProgressByTile, state.developmentQueue, busy, state.developmentProcessLimit);
  const garrisoning = garrisonPlannedTileKeys(state);
  const rows: AgendaTown[] = [];
  for (const tile of towns) {
    const row = agendaTown(tile, state.me, garrisoning);
    if (row) rows.push(row);
  }
  const nextRefillAt = nextManpowerRefillForPlayer(state.me, nowMs);
  // Same rule as the tracker's Coin row: every Manifest shares one price, counted only while one can be commissioned.
  const owned = new Set(state.techIds);
  const choices = new Set(state.techChoices);
  const canCommission = state.techCatalog.some((tech) => manifestNodeState(tech, owned, choices) === "available");
  const manifestCost = canCommission ? state.techCatalog.find((tech) => !owned.has(tech.id))?.requirements.gold : undefined;
  return {
    manpower: {
      current: state.manpower,
      cap: state.manpowerCap,
      nextBatchInMs: nextRefillAt === undefined ? undefined : Math.max(0, nextRefillAt - nowMs),
      nextBatchAmount: freshNextBatchAmount(state.me, state.nextManpowerBatchAmount, state.nextManpowerBatchAmountAt, nowMs)
    },
    slots: { busy: development.busy, limit: development.limit, queued: development.queue.length },
    towns: rows,
    gold: spendableCoin(state.gold),
    manifestCost,
    afcUpgradesReady: readyAfcUpgradeCount(state)
  };
};
