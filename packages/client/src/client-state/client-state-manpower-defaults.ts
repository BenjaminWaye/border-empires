import { EXPAND_MANPOWER_COST, MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE, SETTLE_MANPOWER_COST } from "@border-empires/shared";

type ManpowerModifier = { label: string; amount: number; note?: string };

export type ManpowerState = {
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  logisticsThroughputPerMinute: number;
  expandManpowerCost: number;
  settleManpowerCost: number;
  manpowerBreakdown: { cap: ManpowerModifier[]; regen: ManpowerModifier[]; biotaTowns?: import("@border-empires/sim-protocol").BiotaTownStatus[] };
  nextManpowerBatchAmount: number | undefined;
  /** Client clock when nextManpowerBatchAmount arrived; the amount is stale once a refill boundary passes after it. */
  nextManpowerBatchAmountAt: number | undefined;
  /** Dev-queue tiles whose manpower the server already holds (PLAYER_UPDATE devQueue `manpowerReserved`). */
  devQueueManpowerReservedTileKeys: Set<string>;
};

export const createInitialManpowerState = (): ManpowerState => ({
  manpower: MANPOWER_BASE_CAP,
  manpowerCap: MANPOWER_BASE_CAP,
  manpowerRegenPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  logisticsThroughputPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  expandManpowerCost: EXPAND_MANPOWER_COST, // frontier-scaled EXPAND price; real value arrives via PLAYER_UPDATE
  settleManpowerCost: SETTLE_MANPOWER_COST, // garrison price after Expansion Doctrine; real value arrives via PLAYER_UPDATE
  manpowerBreakdown: {
    cap: [{ label: "Base", amount: MANPOWER_BASE_CAP }],
    regen: [{ label: "Base", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
  },
  nextManpowerBatchAmount: undefined,
  nextManpowerBatchAmountAt: undefined,
  devQueueManpowerReservedTileKeys: new Set<string>()
});
