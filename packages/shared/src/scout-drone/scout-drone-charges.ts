// Scout drone charges (docs/explore-scout-plan.md §13): each stop in a flight
// spends one charge, and each charge comes back SCOUT_DRONE_CHARGE_REFILL_MS
// after it was spent, so a player has at most SCOUT_DRONE_MAX_CHARGES to spend
// in any 4 hours. Only the times charges were spent are kept, and what is left
// is worked out on read, so nothing ticks.

export const SCOUT_DRONE_MAX_CHARGES = 8;
export const SCOUT_DRONE_CHARGE_REFILL_MS = 4 * 60 * 60_000;

/** The wire form, on every SCOUT_DRONE message: when each still-refilling charge was spent. */
export type ScoutDroneCharges = { max: number; refillMs: number; usedAt: number[] };

/** Spend times still inside the refill window, oldest first. */
export const liveScoutChargeSpends = (usedAt: readonly number[], nowMs: number, refillMs: number = SCOUT_DRONE_CHARGE_REFILL_MS): number[] =>
  usedAt.filter((at) => nowMs - at < refillMs).sort((a, b) => a - b);

export const scoutChargesAvailable = (charges: Pick<ScoutDroneCharges, "max" | "usedAt"> & { refillMs?: number }, nowMs: number): number =>
  Math.max(0, charges.max - liveScoutChargeSpends(charges.usedAt, nowMs, charges.refillMs).length);

/** When the next spent charge comes back, or undefined when all are ready. */
export const nextScoutChargeAt = (charges: Pick<ScoutDroneCharges, "usedAt"> & { refillMs?: number }, nowMs: number): number | undefined => {
  const refillMs = charges.refillMs ?? SCOUT_DRONE_CHARGE_REFILL_MS;
  const live = liveScoutChargeSpends(charges.usedAt, nowMs, refillMs);
  return live.length > 0 ? live[0]! + refillMs : undefined;
};
