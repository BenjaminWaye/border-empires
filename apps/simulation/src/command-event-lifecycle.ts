import type { SimulationEvent } from "@border-empires/sim-protocol";

export const DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY = 4_096;
export const DEFAULT_MAX_PLAYER_SEQ_REPLAY_ENTRIES = 16_384;

export const isTerminalCommandEvent = (event: SimulationEvent): boolean =>
  event.eventType === "COMMAND_REJECTED" || event.eventType === "COMBAT_RESOLVED";
