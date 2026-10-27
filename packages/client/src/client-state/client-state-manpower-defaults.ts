import { EXPAND_MANPOWER_COST, MANPOWER_BASE_CAP, MANPOWER_BASE_REGEN_PER_MINUTE } from "@border-empires/shared";

type ManpowerModifier = { label: string; amount: number; note?: string };

export type ManpowerState = {
  manpower: number;
  manpowerCap: number;
  manpowerRegenPerMinute: number;
  logisticsThroughputPerMinute: number;
  expandManpowerCost: number;
  manpowerBreakdown: { cap: ManpowerModifier[]; regen: ManpowerModifier[] };
  nextManpowerBatchAmount: number | undefined;
};

export const createInitialManpowerState = (): ManpowerState => ({
  manpower: MANPOWER_BASE_CAP,
  manpowerCap: MANPOWER_BASE_CAP,
  manpowerRegenPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  logisticsThroughputPerMinute: MANPOWER_BASE_REGEN_PER_MINUTE,
  expandManpowerCost: EXPAND_MANPOWER_COST, // frontier-scaled EXPAND price; real value arrives via PLAYER_UPDATE
  manpowerBreakdown: {
    cap: [{ label: "Base", amount: MANPOWER_BASE_CAP }],
    regen: [{ label: "Base", amount: MANPOWER_BASE_REGEN_PER_MINUTE }]
  },
  nextManpowerBatchAmount: undefined
});
