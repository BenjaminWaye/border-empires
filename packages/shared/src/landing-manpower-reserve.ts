import { STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE } from "./config.js";

// One-time landing reserve: every new empire -- a human when they join, an AI
// empire when the season starts -- lands with this much extra manpower on top
// of its starting manpower, allowed above the cap the same way a Waystation
// grant is (regen pauses until it is spent back under the cap).
//
// Why a lump and not faster regen: regen is paid out once per 4-hour refill
// window (manpower-refill.ts), so a new player's first payout can be hours
// away and a regen boost does nothing for the first session. Playtest and the
// first-day sim (apps/simulation/src/first-day-sim) both showed a new player
// who spends freely running out within ~15-20 minutes; the reserve was sized
// to roughly double a first session at that pace, then doubled again because
// new players still ran dry too fast.

export const LANDING_MANPOWER_RESERVE = 2_000;

const MINUTE_MS = 60_000;

/**
 * Late-join catch-up: an empire that lands after the season started also gets
 * the manpower a one-town empire (its starting capital alone) would have
 * regenerated since the season start. Joining at the start earns nothing extra.
 * `seasonStartedAt` is undefined when the season isn't active (pending, ended
 * or unknown), which also earns nothing extra.
 */
export const lateJoinManpowerCatchUp = (nowMs: number, seasonStartedAt: number | undefined): number => {
  if (seasonStartedAt === undefined || !Number.isFinite(seasonStartedAt)) return 0;
  const missedMinutes = Math.max(0, nowMs - seasonStartedAt) / MINUTE_MS;
  return Math.floor(missedMinutes * STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE);
};

/** The full one-time landing grant: the base reserve plus any late-join catch-up. */
export const landingManpowerReserve = (nowMs: number, seasonStartedAt: number | undefined): number =>
  LANDING_MANPOWER_RESERVE + lateJoinManpowerCatchUp(nowMs, seasonStartedAt);
