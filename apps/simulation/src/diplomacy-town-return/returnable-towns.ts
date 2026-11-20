// Which towns a player may hand back in a deal (the "return a town" term,
// packages/shared diplomacy-town-return.ts), and the settlement's re-check.
//
// "Recently captured" comes from the personal impact log: the durable,
// bounded 24h record the Activity dashboard already keeps, which names the
// previous owner of every captured town (TOWN_CAPTURED counterpartyPlayerId)
// and survives restart with the other activity logs. A town qualifies while
// its holder still owns it and its newest TOWN_CAPTURED entry for that holder
// is inside TOWN_RETURN_WINDOW_MS. Barbarian captures never qualify. If the
// log's entry cap drops an old capture early, the town just stops being
// returnable: eligibility can be lost, never invented.
import type { DomainTileState } from "@border-empires/game-domain";
import { TOWN_RETURN_WINDOW_MS, townRefKey, type DiplomacyTownRef, type ReturnableTown } from "@border-empires/shared";

import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";

export type TownReturnReadContext = {
  tiles: ReadonlyMap<string, DomainTileState>;
  now: () => number;
  personalImpactEntries: () => readonly PersonalImpactEvent[];
  /** The town's own coin income, for the AI's valuation; undefined when unknown. */
  townGoldPerMinute?: (tile: DomainTileState) => number | undefined;
  /** True while a fight or a settle is pending on the tile. */
  isTileLocked?: (tileKey: string) => boolean;
};

const isBarbarian = (playerId: string): boolean => playerId.startsWith("barbarian-");

/** Every town `holderId` may hand back right now, newest capture first, one entry per tile. */
export const returnableTownsFor = (ctx: TownReturnReadContext, holderId: string): ReturnableTown[] => {
  const cutoff = ctx.now() - TOWN_RETURN_WINDOW_MS;
  const entries = ctx.personalImpactEntries();
  const seen = new Set<string>();
  const towns: ReturnableTown[] = [];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (entry.kind !== "TOWN_CAPTURED" || entry.playerId !== holderId || entry.occurredAt < cutoff) continue;
    const key = townRefKey(entry);
    if (seen.has(key)) continue;
    seen.add(key);
    const from = entry.counterpartyPlayerId;
    if (!from || from === holderId || isBarbarian(from)) continue;
    const tile = ctx.tiles.get(key);
    if (!tile?.town || tile.ownerId !== holderId) continue;
    const goldPerMinute = ctx.townGoldPerMinute?.(tile);
    towns.push({
      x: entry.x,
      y: entry.y,
      toPlayerId: from,
      ...(tile.town.name ? { name: tile.town.name } : {}),
      tier: tile.town.populationTier,
      ...(goldPerMinute !== undefined && Number.isFinite(goldPerMinute) && goldPerMinute >= 0 ? { goldPerMinute } : {}),
      capturedAt: entry.occurredAt
    });
  }
  return towns;
};

/**
 * Why `giverId` can't hand `towns` to `receiverId` now, or undefined when it
 * can. A refund (a deal paid back because it fell through) only needs the
 * giver to still hold each town: it is handing back what it was just given.
 */
export const townReturnProblem = (
  ctx: TownReturnReadContext,
  giver: { id: string; name?: string },
  receiverId: string,
  towns: readonly DiplomacyTownRef[],
  refund: boolean
): string | undefined => {
  const giverName = giver.name ?? giver.id;
  const eligible = refund ? undefined : new Set(returnableTownsFor(ctx, giver.id).filter((town) => town.toPlayerId === receiverId).map(townRefKey));
  for (const town of towns) {
    const tile = ctx.tiles.get(townRefKey(town));
    const where = `(${town.x}, ${town.y})`;
    if (!tile?.town || tile.ownerId !== giver.id) return `${giverName} no longer holds the town at ${where}`;
    if (eligible && !eligible.has(townRefKey(town))) return `the town at ${where} wasn't taken from them in the last day`;
    if (tile.muster) return `${giverName} has a muster flag in the town at ${where}`;
    if (ctx.isTileLocked?.(townRefKey(town))) return `the town at ${where} is being fought over or settled`;
  }
  return undefined;
};
