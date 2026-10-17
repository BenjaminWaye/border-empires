// One-time landing reserve: every new empire -- a human when they join, an AI
// empire when the season starts -- lands with this much extra manpower on top
// of its starting manpower, allowed above the cap the same way a Waystation
// grant is (regen pauses until it is spent back under the cap).
//
// Why a lump and not faster regen: regen is paid out once per 4-hour refill
// window (manpower-refill.ts), so a new player's first payout can be hours
// away and a regen boost does nothing for the first session. Playtest and the
// first-day sim (apps/simulation/src/first-day-sim) both showed a new player
// who spends freely running out within ~15-20 minutes; the reserve is sized
// to roughly double a first session at that pace.

export const LANDING_MANPOWER_RESERVE = 1_000;
