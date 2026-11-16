// Small wording helpers shared by the daily-story builders (daily-story.ts,
// daily-story-combat.ts, player-growth.ts). Kept separate so every headline
// formats numbers and counts the same way.
import type { DailyStoryEvent, LeaderboardOverallEntry } from "@border-empires/game-domain";

/** "18730" reads as a code, not a number: group thousands like "18,730". */
export const formatCount = (value: number): string => value.toLocaleString("en-US");

// "1 tiles" / "1 flips" reads as broken English -- caught against real
// staging data, not invented.
export const pluralize = (count: number, noun: string): string => `${formatCount(count)} ${noun}${count === 1 ? "" : "s"}`;

/** "once", "twice", "95 times". */
export const timesPhrase = (count: number): string =>
  count === 1 ? "once" : count === 2 ? "twice" : `${formatCount(count)} times`;

/**
 * Share of the territory a player held at the start of the window that they
 * lost, or undefined when their current size is unknown (not on the
 * leaderboard). Start size = current tiles + tiles lost; tiles gained back
 * in the same window make this a slight under-estimate, never an over-one.
 */
export const territoryLossShare = (
  playerId: string,
  tilesLost: number,
  powerScore: readonly Pick<LeaderboardOverallEntry, "id" | "tiles">[]
): number | undefined => {
  const current = powerScore.find((entry) => entry.id === playerId)?.tiles;
  if (current === undefined || tilesLost <= 0) return undefined;
  return tilesLost / (current + tilesLost);
};

/** " — 38% of their realm" style clause, only when the share is big enough to be news. */
export const MEANINGFUL_LOSS_SHARE = 0.1;
export const lossShareClause = (share: number | undefined): string =>
  share !== undefined && share >= MEANINGFUL_LOSS_SHARE ? `, ${Math.round(share * 100)}% of their realm` : "";

type DailyStoryEventPayload = Omit<DailyStoryEvent, "participantIds" | "dashboardText">;

// Keep these World Pulse-only fields off the public /api/activity JSON shape.
// The authenticated projection reads them in-process, while existing public
// clients and the Slack digest retain their established response contract.
export const story = (event: DailyStoryEventPayload, participantIds: string[], dashboardText: string = event.text): DailyStoryEvent =>
  Object.defineProperties(event, {
    participantIds: { value: participantIds, enumerable: false },
    dashboardText: { value: dashboardText, enumerable: false }
  }) as DailyStoryEvent;
