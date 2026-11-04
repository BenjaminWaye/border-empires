import type { ClientState } from "../client-state/client-state.js";

export type PlayerUpdateManpowerState = Pick<
  ClientState,
  | "manpower"
  | "manpowerCap"
  | "manpowerRegenPerMinute"
  | "logisticsThroughputPerMinute"
  | "expandManpowerCost"
  | "settleManpowerCost"
  | "nextManpowerBatchAmount"
  | "nextManpowerBatchAmountAt"
  | "devQueueManpowerReservedTileKeys"
>;

/**
 * Tiles whose queued entry already holds its manpower on the server. A
 * queued garrison holding none waits in the client queue until the server
 * reserves it from the next refill batch. Undefined when the message has no
 * devQueue (keep the last known set).
 */
export const devQueueManpowerReservedTileKeys = (devQueue: unknown): Set<string> | undefined => {
  if (!Array.isArray(devQueue)) return undefined;
  const keys = new Set<string>();
  for (const entry of devQueue) {
    if (typeof entry !== "object" || entry === null) continue;
    const { tileKey, manpowerReserved } = entry as Partial<Record<"tileKey" | "manpowerReserved", unknown>>;
    if (manpowerReserved === true && typeof tileKey === "string") keys.add(tileKey);
  }
  return keys;
};

// PLAYER_UPDATE's manpower numbers (pool, cap, regen, logistics and the
// frontier-scaled EXPAND price). A field the message omits keeps its last value.
export const applyPlayerUpdateManpowerFields = (state: PlayerUpdateManpowerState, msg: Record<string, unknown>, nowMs: number = Date.now()): void => {
  const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);
  if (typeof msg.nextManpowerBatchAmount === "number") {
    state.nextManpowerBatchAmount = msg.nextManpowerBatchAmount;
    state.nextManpowerBatchAmountAt = nowMs;
  }
  state.manpower = numberOr(msg.manpower, state.manpower);
  state.manpowerCap = numberOr(msg.manpowerCap, state.manpowerCap);
  state.manpowerRegenPerMinute = numberOr(msg.manpowerRegenPerMinute, state.manpowerRegenPerMinute);
  state.logisticsThroughputPerMinute = numberOr(msg.logisticsThroughputPerMinute, state.logisticsThroughputPerMinute);
  state.expandManpowerCost = numberOr(msg.expandManpowerCost, state.expandManpowerCost);
  state.settleManpowerCost = numberOr(msg.settleManpowerCost, state.settleManpowerCost);
  state.devQueueManpowerReservedTileKeys = devQueueManpowerReservedTileKeys(msg.devQueue) ?? state.devQueueManpowerReservedTileKeys;
};
