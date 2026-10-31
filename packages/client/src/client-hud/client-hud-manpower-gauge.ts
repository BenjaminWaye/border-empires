import type { ClientState } from "../client-state/client-state.js";
import { manpowerGaugeChipHtml, ownStagedManpower } from "../client-manpower-gauge/client-manpower-gauge.js";
import { nextManpowerRefillForPlayer } from "../client-manpower-gauge/client-manpower-refill.js";

export const hudManpowerGaugeHtml = (state: ClientState, formatAmount: (value: number) => string): string => {
  const nowMs = Date.now();
  return manpowerGaugeChipHtml({
    manpower: state.manpower, manpowerCap: state.manpowerCap,
    staged: ownStagedManpower(state.tiles.values(), state.me, nowMs),
    regenPerMinute: state.manpowerRegenPerMinute,
    nextBatchAmount: state.nextManpowerBatchAmount,
    logisticsPerMinute: state.logisticsThroughputPerMinute,
    nextRefillAtMs: nextManpowerRefillForPlayer(state.me, nowMs), nowMs, formatAmount
  });
};
