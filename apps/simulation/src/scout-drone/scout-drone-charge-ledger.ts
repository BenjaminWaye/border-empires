import type { DomainPlayer } from "@border-empires/game-domain";
import {
  SCOUT_DRONE_CHARGE_REFILL_MS,
  SCOUT_DRONE_MAX_CHARGES,
  liveScoutChargeSpends,
  scoutChargesAvailable,
  type ScoutDroneCharges
} from "@border-empires/shared";

// Scout drone charges on the server (shared scout-drone-charges.ts): the times
// each player spent a charge, kept on the player record (`scoutChargeSpends`),
// so they are saved with every snapshot and restored on boot (runtime-snapshot-
// sections.ts, runtime-hydration.ts, runtime-state-export.ts). At most
// SCOUT_DRONE_MAX_CHARGES are kept per player; refilled spends are dropped
// whenever the player's charges are read or spent, so nothing ticks.

type ChargePlayer = Pick<DomainPlayer, "scoutChargeSpends">;

export type ScoutChargeLedger = {
  readonly available: (playerId: string, nowMs: number) => number;
  readonly spend: (playerId: string, count: number, nowMs: number) => void;
  /** The wire form for a SCOUT_DRONE message: spends still refilling, server clock. */
  readonly wire: (playerId: string, nowMs: number) => ScoutDroneCharges;
};

export const createScoutChargeLedger = (players: () => ReadonlyMap<string, ChargePlayer>): ScoutChargeLedger => {
  const live = (player: ChargePlayer | undefined, nowMs: number): number[] => {
    if (!player?.scoutChargeSpends?.length) return [];
    const kept = liveScoutChargeSpends(player.scoutChargeSpends, nowMs, SCOUT_DRONE_CHARGE_REFILL_MS);
    if (kept.length === 0) delete player.scoutChargeSpends;
    else if (kept.length !== player.scoutChargeSpends.length) player.scoutChargeSpends = kept;
    return kept;
  };
  const wire = (playerId: string, nowMs: number): ScoutDroneCharges => ({
    max: SCOUT_DRONE_MAX_CHARGES,
    refillMs: SCOUT_DRONE_CHARGE_REFILL_MS,
    usedAt: [...live(players().get(playerId), nowMs)]
  });
  return {
    available: (playerId, nowMs) => scoutChargesAvailable(wire(playerId, nowMs), nowMs),
    spend: (playerId, count, nowMs) => {
      const player = players().get(playerId);
      if (!player || count <= 0) return;
      const next = live(player, nowMs);
      for (let i = 0; i < Math.min(count, SCOUT_DRONE_MAX_CHARGES); i += 1) next.push(nowMs);
      player.scoutChargeSpends = next.slice(-SCOUT_DRONE_MAX_CHARGES);
    },
    wire
  };
};
