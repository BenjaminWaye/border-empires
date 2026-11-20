import {
  SCOUT_DRONE_CHARGE_REFILL_MS,
  SCOUT_DRONE_MAX_CHARGES,
  SCOUT_DRONE_MAX_STOPS,
  liveScoutChargeSpends,
  scoutChargesAvailable,
  type ScoutDroneCharges
} from "@border-empires/shared";

// Scout drone charges on the server (shared scout-drone-charges.ts): only the
// times each player spent a charge, pruned once they refill. In memory only,
// like the flights: a restart (or an eviction under the cap) refunds every
// spent charge, which costs at most SCOUT_DRONE_MAX_CHARGES extra stops per
// player per restart.

/** Hard bound (docs/agents/state-and-persistence-discipline.md); each eviction counts in gauge(). */
export const SCOUT_DRONE_MAX_CHARGE_ENTRIES = 20_000;

export type ScoutChargeLedger = {
  readonly available: (playerId: string, nowMs: number) => number;
  readonly spend: (playerId: string, count: number, nowMs: number) => void;
  /** The wire form for a SCOUT_DRONE message: spends still refilling, server clock. */
  readonly wire: (playerId: string, nowMs: number) => ScoutDroneCharges;
  /** Drops refilled spends and players with none left refilling. */
  readonly prune: (nowMs: number) => void;
  readonly size: () => number;
  readonly evictions: () => number;
};

export const createScoutChargeLedger = (maxEntries: number = SCOUT_DRONE_MAX_CHARGE_ENTRIES): ScoutChargeLedger => {
  const spends = new Map<string, number[]>();
  let evictions = 0;
  const live = (playerId: string, nowMs: number): number[] => liveScoutChargeSpends(spends.get(playerId) ?? [], nowMs, SCOUT_DRONE_CHARGE_REFILL_MS);
  return {
    available: (playerId, nowMs) => scoutChargesAvailable({ max: SCOUT_DRONE_MAX_CHARGES, refillMs: SCOUT_DRONE_CHARGE_REFILL_MS, usedAt: live(playerId, nowMs) }, nowMs),
    spend: (playerId, count, nowMs) => {
      if (count <= 0) return;
      const next = live(playerId, nowMs);
      // A stop never costs more than one charge, and a flight never has more stops than this.
      for (let i = 0; i < Math.min(count, SCOUT_DRONE_MAX_STOPS); i += 1) next.push(nowMs);
      if (!spends.has(playerId) && spends.size >= maxEntries) {
        const oldest = spends.keys().next().value;
        if (oldest !== undefined) spends.delete(oldest);
        evictions += 1;
      }
      spends.delete(playerId);
      spends.set(playerId, next.slice(-SCOUT_DRONE_MAX_CHARGES));
    },
    wire: (playerId, nowMs) => ({ max: SCOUT_DRONE_MAX_CHARGES, refillMs: SCOUT_DRONE_CHARGE_REFILL_MS, usedAt: live(playerId, nowMs) }),
    prune: (nowMs) => {
      for (const [playerId, usedAt] of spends) {
        // Spends are kept oldest first, so only a map whose oldest spend has refilled changes.
        if (usedAt.length > 0 && nowMs - usedAt[0]! < SCOUT_DRONE_CHARGE_REFILL_MS) continue;
        const kept = liveScoutChargeSpends(usedAt, nowMs, SCOUT_DRONE_CHARGE_REFILL_MS);
        if (kept.length === 0) spends.delete(playerId);
        else spends.set(playerId, kept);
      }
    },
    size: () => spends.size,
    evictions: () => evictions
  };
};
