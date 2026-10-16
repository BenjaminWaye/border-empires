// First-day manpower boost: for the first 24 hours of an empire's life its
// manpower regenerates faster, so a new empire's day 1 is several sessions of
// play instead of one ~20-minute burst followed by a long wait (playtest
// feedback, docs/core-loop.md §12). Every new empire gets it -- humans when
// they join, AI empires when the season starts -- so it changes pacing, not
// who is ahead.
//
// Stamped once on the player record (runtime-economy.ts's first manpower
// settle) with the rate in force at that moment, so retuning these constants
// never changes a boost that is already running. Regen still pays out in the
// normal refill windows (manpower-refill.ts); the boost only raises the rate.

export const STARTER_MANPOWER_BOOST_DURATION_MS = 24 * 60 * 60 * 1000;
export const STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE = 1.6;

export type StarterManpowerBoost = {
  /** When the boost ends (epoch ms). */
  until: number;
  /** Extra manpower regen per minute while it lasts. */
  regenPerMinute: number;
};

export const createStarterManpowerBoost = (nowMs: number): StarterManpowerBoost => ({
  until: nowMs + STARTER_MANPOWER_BOOST_DURATION_MS,
  regenPerMinute: STARTER_MANPOWER_BOOST_REGEN_PER_MINUTE
});

/** Extra regen per minute from the boost at `nowMs` (0 once it has ended or if the player never had one). */
export const starterManpowerBoostRegenAt = (boost: StarterManpowerBoost | undefined, nowMs: number): number =>
  boost && nowMs < boost.until ? Math.max(0, boost.regenPerMinute) : 0;
