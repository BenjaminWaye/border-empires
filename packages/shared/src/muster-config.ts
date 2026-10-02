// Maximum number of actions one ADVANCE/MARCH flag may have committed at
// once. A flag can launch another action as soon as the prior action starts
// its travel/claim/combat timer, while this cap prevents a single flag from
// flooding the lock table.
export const MUSTER_MAX_CONCURRENT_ACTIONS = 3;

// A fresh muster flag's default cap is the larger of MUSTER_FLAG_BASE_CAP_FLOOR
// and this fraction of the player's manpower cap. The floor keeps a flag
// useful at the start (150 is roughly 10% of a starting pool, enough for a
// Palisade) while the fraction lets the default grow with a big pool, and
// either way a single flag can't lock up the whole pool by default. Each
// "Expand Capacity" press adds another share of the *current* manpower cap,
// so upgrading stays meaningful late-game instead of being dwarfed by a fixed
// increment.
export const MUSTER_FLAG_CAP_MANPOWER_FRACTION = 0.1;
export const MUSTER_FLAG_BASE_CAP_FLOOR = 150;
// "Expand Capacity" is currently FREE (no manpower or resource cost) — see
// handleUpgradeMusterCapCommand (runtime-muster-cap-upgrade-command.ts).
// Deliberately temporary: the intended cost is a FOOD resource-slot
// occupation (the same supply/demand-slot mechanic Forts/Siege
// Outposts/Observatories use — resource-slot-view.ts), a real design task
// of its own that hasn't been done yet. No constant lives here for that
// cost until it's designed; don't reintroduce a flat manpower charge in
// its place.

/**
 * A muster flag's enforced cap: the larger of MUSTER_FLAG_BASE_CAP_FLOOR and
 * MUSTER_FLAG_CAP_MANPOWER_FRACTION of the player's manpower cap, plus that
 * same fraction again per "Expand Capacity" upgrade purchased (capLevel) —
 * but never more than the player's manpower cap itself. Without that final
 * clamp, enough upgrades would let a single flag demand more manpower than
 * the player's empire-wide pool can ever hold, which defeats the point of
 * capping flags in the first place. Recomputed live off the player's
 * *current* manpower cap wherever it's used (runtime-muster-tick.ts's
 * headroom calc, the tile-menu display), so it tracks growth/loss of that
 * cap automatically.
 */
export const musterFlagCap = (manpowerCap: number, capLevel: number | undefined): number => {
  const share = manpowerCap * MUSTER_FLAG_CAP_MANPOWER_FRACTION;
  const raw = Math.max(MUSTER_FLAG_BASE_CAP_FLOOR, share) + (capLevel ?? 0) * share;
  return Math.min(raw, manpowerCap);
};
