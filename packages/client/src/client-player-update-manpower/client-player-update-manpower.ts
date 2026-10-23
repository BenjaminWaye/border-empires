import type { ClientState } from "../client-state/client-state.js";

export type PlayerUpdateManpowerState = Pick<
  ClientState,
  "manpower" | "manpowerCap" | "manpowerRegenPerMinute" | "logisticsThroughputPerMinute" | "expandManpowerCost"
>;

// PLAYER_UPDATE's manpower numbers (pool, cap, regen, logistics and the
// frontier-scaled EXPAND price). A field the message omits keeps its last value.
export const applyPlayerUpdateManpowerFields = (state: PlayerUpdateManpowerState, msg: Record<string, unknown>): void => {
  const numberOr = (value: unknown, fallback: number): number => (typeof value === "number" ? value : fallback);
  state.manpower = numberOr(msg.manpower, state.manpower);
  state.manpowerCap = numberOr(msg.manpowerCap, state.manpowerCap);
  state.manpowerRegenPerMinute = numberOr(msg.manpowerRegenPerMinute, state.manpowerRegenPerMinute);
  state.logisticsThroughputPerMinute = numberOr(msg.logisticsThroughputPerMinute, state.logisticsThroughputPerMinute);
  state.expandManpowerCost = numberOr(msg.expandManpowerCost, state.expandManpowerCost);
};
