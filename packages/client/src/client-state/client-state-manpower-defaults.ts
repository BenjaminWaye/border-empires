import { EXPAND_MANPOWER_COST, MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE } from "@border-empires/shared";

export const createInitialManpowerState = () => ({
  manpower: MANPOWER_BASE_CAP,
  manpowerCap: MANPOWER_BASE_CAP,
  manpowerRegenPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  logisticsThroughputPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  expandManpowerCost: EXPAND_MANPOWER_COST, // frontier-scaled EXPAND price; real value arrives via PLAYER_UPDATE
  manpowerBreakdown: {
    cap: [{ label: "Base", amount: MANPOWER_BASE_CAP }],
    regen: [{ label: "Base", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
  } as { cap: Array<{ label: string; amount: number; note?: string }>; regen: Array<{ label: string; amount: number; note?: string }> },
  nextManpowerBatchAmount: undefined as number | undefined
});
