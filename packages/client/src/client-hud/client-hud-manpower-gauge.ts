import type { ClientState } from "../client-state/client-state.js";
import { manpowerGaugeChipHtml, ownStagedManpower } from "../client-manpower-gauge/client-manpower-gauge.js";
import { freshNextBatchAmount, nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";

export const hudManpowerGaugeHtml = (state: ClientState, formatAmount: (value: number) => string): string => {
  const nowMs = Date.now();
  return manpowerGaugeChipHtml({
    manpower: state.manpower, manpowerCap: state.manpowerCap,
    staged: ownStagedManpower(state.tiles.values(), state.me, nowMs),
    regenPerMinute: state.manpowerRegenPerMinute,
    nextBatchAmount: freshNextBatchAmount(state.me, state.nextManpowerBatchAmount, state.nextManpowerBatchAmountAt, nowMs),
    logisticsPerMinute: state.logisticsThroughputPerMinute,
    nextRefillAtMs: nextManpowerRefillForPlayer(state.me, nowMs), nowMs, formatAmount
  });
};
