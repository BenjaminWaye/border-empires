// Small wording helpers shared by the daily-story builders (daily-story.ts,
// daily-story-combat.ts, player-growth.ts). Kept separate so every headline
// formats numbers and counts the same way.
import type { DailyStoryEvent, TerritoryMomentumEntry } from "@border-empires/game-domain";

/** "18730" reads as a code, not a number: group thousands like "18,730". */
export const formatCount = (value: number): string => value.toLocaleString("en-US");

// "1 tiles" / "1 flips" reads as broken English -- caught against real
// staging data, not invented.
export const pluralize = (count: number, noun: string): string => `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;

/** "once", "twice", "95 times". */
export const timesPhrase = (count: number): string =>
  count === 1 ? "once" : count === 2 ? "twice" : `${formatCount(count)} times`;

/**
 * How much smaller a player's realm is than at the start of the window, as a
 * fraction of what they held then -- or undefined when their size is unknown
 * (an older sim that doesn't send tilesOwned yet) or they did not shrink.
 *
 * NET, not gross tilesLost24h: tilesLost counts every distinct tile that left
 * the player in the window, including frontier claimed and lost again inside
 * it, which were never part of the starting realm. An empire that claims 200
 * neutral tiles and loses them all ends where it started, and must not read
 * as "67% of their realm". Start size = owned now - net24h; tilesOwned counts
 * frontier and settled alike, the same tiles net24h counts (the leaderboard's
 * settled-only `tiles` would overstate the share).
 */
export const territoryShrinkShare = (
  playerId: string,
  territoryMomentum: readonly Pick<TerritoryMomentumEntry, "playerId" | "net24h" | "tilesOwned">[]
): number | undefined => {
  const entry = territoryMomentum.find((candidate) => candidate.playerId === playerId);
  if (!entry || entry.tilesOwned === undefined || entry.net24h >= 0) return undefined;
  const startOwned = entry.tilesOwned - entry.net24h;
  return startOwned > 0 ? -entry.net24h / startOwned : undefined;
};

/** ", leaving their realm 12% smaller" clause, only when the shrink is big enough to be news. */
export const MEANINGFUL_LOSS_SHARE = 0.1;
export const lossShareClause = (share: number | undefined): string =>
  share !== undefined && share >= MEANINGFUL_LOSS_SHARE ? `, leaving their realm ${Math.round(share * 100)}% smaller` : "";

type DailyStoryEventPayload = Omit<DailyStoryEvent, "participantIds" | "dashboardText">;

// Keep these World Pulse-only fields off the public /api/activity JSON shape.
// The authenticated projection reads them in-process, while existing public
// clients and the Slack digest retain their established response contract.
export const story = (event: DailyStoryEventPayload, participantIds: string[], dashboardText: string = event.text): DailyStoryEvent =>
  Object.defineProperties(event, {
    participantIds: { value: participantIds, enumerable: false },
    dashboardText: { value: dashboardText, enumerable: false }
  }) as DailyStoryEvent;
