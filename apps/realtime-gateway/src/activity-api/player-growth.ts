// Diffs the live leaderboard against each player's stored "yesterday"
// baseline (player-growth-baseline-store.ts) to produce day-over-day growth
// numbers for daily-story.ts's ECONOMY_BOOM/MANPOWER_SURGE events. A
// baseline is rolled forward (to today's values) at most once per
// GROWTH_BASELINE_ROLL_INTERVAL_MS -- reads always diff against whatever
// baseline is currently stored, so growth is visible continuously through
// the day, not just once when the roll happens.
import type { DailyStoryEvent, LeaderboardOverallEntry, PlayerGrowthDelta } from "@border-empires/game-domain";

import type { PlayerGrowthBaselineStore } from "../player-growth-baseline-store/player-growth-baseline-store.js";
import { normalizeSignificance, SIGNIFICANCE_SCALE } from "./daily-story-significance.js";

export const GROWTH_BASELINE_ROLL_INTERVAL_MS = 24 * 60 * 60_000;

type PlayerNameResolver = (playerId: string) => string;

export const computePlayerGrowth = async (
  store: PlayerGrowthBaselineStore,
  powerScore: LeaderboardOverallEntry[],
  nameFor: PlayerNameResolver,
  now: number
): Promise<PlayerGrowthDelta[]> => {
  const deltas: PlayerGrowthDelta[] = [];
  for (const entry of powerScore) {
    const baseline = await store.get(entry.id);
    if (baseline) {
      deltas.push({
        playerId: entry.id,
        playerName: nameFor(entry.id),
        incomePerMinute: entry.incomePerMinute,
        incomePerMinuteDelta: entry.incomePerMinute - baseline.incomePerMinute,
        manpowerCap: entry.manpowerCap,
        manpowerCapDelta: entry.manpowerCap - baseline.manpowerCap,
        baselineAt: baseline.recordedAt
      });
    }
    if (!baseline || now - baseline.recordedAt >= GROWTH_BASELINE_ROLL_INTERVAL_MS) {
      await store.set({ playerId: entry.id, incomePerMinute: entry.incomePerMinute, manpowerCap: entry.manpowerCap, recordedAt: now });
    }
  }
  return deltas;
};

const GOLD_PER_MINUTE_TO_PER_DAY = 24 * 60;

export const buildEconomyBoom = (growth: PlayerGrowthDelta[]): DailyStoryEvent | undefined => {
  if (growth.length === 0) return undefined;
  const top = [...growth].sort((a, b) => b.incomePerMinuteDelta - a.incomePerMinuteDelta)[0];
  if (!top || top.incomePerMinuteDelta <= 0) return undefined;
  const perDay = Math.round(top.incomePerMinuteDelta * GOLD_PER_MINUTE_TO_PER_DAY * 10) / 10;
  return {
    type: "ECONOMY_BOOM",
    headline: "Economy Boom",
    text: `${top.playerName}'s economy is booming — gold income is up ${perDay} per day since yesterday.`,
    significance: normalizeSignificance(perDay, SIGNIFICANCE_SCALE.goldPerDay),
    players: [top.playerName]
  };
};

export const buildManpowerSurge = (growth: PlayerGrowthDelta[]): DailyStoryEvent | undefined => {
  if (growth.length === 0) return undefined;
  const top = [...growth].sort((a, b) => b.manpowerCapDelta - a.manpowerCapDelta)[0];
  if (!top || top.manpowerCapDelta <= 0) return undefined;
  const gained = Math.round(top.manpowerCapDelta);
  return {
    type: "MANPOWER_SURGE",
    headline: "Manpower Surge",
    text: `${top.playerName}'s manpower cap has grown by ${gained} since yesterday.`,
    significance: normalizeSignificance(gained, SIGNIFICANCE_SCALE.manpowerCapDelta),
    players: [top.playerName]
  };
};
