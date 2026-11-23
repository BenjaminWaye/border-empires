// Reads ClientState into the agenda's input (client-visit-agenda.ts), with the same checks the map badges,
// the Towns screen and the tracker use, so the agenda never lists something those screens would not offer.

import { MANPOWER_REFILL_WINDOW_MS, spendableCoin } from "@border-empires/shared";
import { readyAfcUpgradeCount, type AfcUpgradeReadiness } from "../client-afc-upgrade-ready/client-afc-upgrade-ready.js";
import { busyDevelopmentProcessCount } from "../client-development-queue/client-development-queue.js";
import { manifestAffordable, manifestNodeState } from "../client-hud-v2/client-hud-v2-manifest.js";
import { freeSlotsOf } from "../client-tile-action-logic/client-resource-slot-reason.js";
import { freshNextBatchAmount, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";
import type { ClientState } from "../client-state/client-state.js";
import { displayTownPopulationTierLabel, garrisonPlannedTileKeys, isOwnTownUngarrisoned, shouldShowTownUnfedWarning, shouldShowTownUpgradeReadyBadge } from "../client-town-growth/client-town-growth.js";
import type { Tile } from "../client-types.js";
import type { AgendaInput, AgendaTown } from "./client-visit-agenda.js";

type AgendaState = Omit<AfcUpgradeReadiness, "techCatalog" | "techIds" | "me" | "gold"> & Parameters<typeof garrisonPlannedTileKeys>[0] & Pick<
  ClientState,
  | "me" | "tiles" | "settleProgressByTile" | "developmentQueue" | "activeDevelopmentProcessCount" | "developmentProcessLimit"
  | "manpower" | "manpowerCap" | "manpowerRegenPerMinute" | "settleManpowerCost" | "nextManpowerBatchAmount" | "nextManpowerBatchAmountAt"
  | "gold" | "techCatalog" | "techIds" | "techChoices" | "pendingTechUnlockId" | "resourceSlots" | "autoSettleTargets"
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
  // Only a Manifest the Manifest screen would let the player commission now (its own affordability check,
  // which honours the server's canResearch), and not while one is already being commissioned.
  const ready = state.pendingTechUnlockId ? undefined : state.techCatalog.find((tech) => manifestNodeState(tech, owned, choices) === "available" && manifestAffordable(tech, state.gold));
  const manifestCost = ready?.requirements.gold;
  return {
    manpower: {
      current: state.manpower,
      cap: state.manpowerCap,
      nextBatchInMs: nextRefillAt === undefined ? undefined : Math.max(0, nextRefillAt - nowMs),
      nextBatchAmount: freshNextBatchAmount(state.me, state.nextManpowerBatchAmount, state.nextManpowerBatchAmountAt, nowMs),
      fullBatch: state.manpowerRegenPerMinute * (MANPOWER_REFILL_WINDOW_MS / 60_000)
    },
    // Auto-garrison targets count as queued: they take slots on their own.
    slots: {
      busy: Math.min(busy, state.developmentProcessLimit),
      limit: state.developmentProcessLimit,
      queued: state.developmentQueue.length + state.autoSettleTargets.size,
      canStart: state.manpower >= state.settleManpowerCost
    },
    freeFoodSlots: freeSlotsOf(state.resourceSlots, "FOOD"),
    towns: rows,
    gold: spendableCoin(state.gold),
    manifestCost,
    afcUpgradesReady: readyAfcUpgradeCount(state)
  };
};
