import type { SimulationEvent } from "@border-empires/sim-protocol";

import { DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY, isTerminalCommandEvent } from "./command-event-lifecycle.js";
import type { StoredSimulationCommand } from "./command-store.js";

export type RecoveredCommandHistory = {
  commands: StoredSimulationCommand[];
  eventsByCommandId: Map<string, SimulationEvent[]>;
};

type CommandRecoveryOptions = {
  maxTerminalCommandReplayHistory?: number;
};

type RecoveredCommandHistoryAccumulator = {
  commands: StoredSimulationCommand[];
  eventsByCommandId: Map<string, SimulationEvent[]>;
  terminalCommandIds: Map<string, true>;
  recoverableCommandIds: Set<string>;
  maxTerminalHistory: number;
};

const resolveMaxTerminalHistory = (options?: CommandRecoveryOptions): number =>
  Math.max(0, options?.maxTerminalCommandReplayHistory ?? DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY);

export const recoverCommandHistory = (
  commands: StoredSimulationCommand[],
  events: SimulationEvent[],
  options?: CommandRecoveryOptions
): RecoveredCommandHistory => {
  const accumulator = createRecoveredCommandHistoryAccumulator(
    {
      commands: [...commands].sort((left, right) => left.queuedAt - right.queuedAt),
      eventsByCommandId: new Map()
    },
    options
  );
  applyEventsToRecoveredCommandHistoryAccumulator(accumulator, events);
  return finalizeRecoveredCommandHistoryAccumulator(accumulator);
};

export const createRecoveredCommandHistoryAccumulator = (
  baseHistory: RecoveredCommandHistory,
  options?: CommandRecoveryOptions
): RecoveredCommandHistoryAccumulator => {
  const eventsByCommandId = new Map<string, SimulationEvent[]>();
  const terminalCommandIds = new Map<string, true>();
  const commands = [...baseHistory.commands].sort((left, right) => left.queuedAt - right.queuedAt);
  const recoverableCommandIds = new Set(commands.map((command) => command.commandId));
  for (const [commandId, existingEvents] of baseHistory.eventsByCommandId.entries()) {
    const clonedEvents = [...existingEvents];
    eventsByCommandId.set(commandId, clonedEvents);
    if (clonedEvents.some(isTerminalCommandEvent)) {
      terminalCommandIds.set(commandId, true);
    }
  }
  return {
    commands,
    eventsByCommandId,
    terminalCommandIds,
    recoverableCommandIds,
    maxTerminalHistory: resolveMaxTerminalHistory(options)
  };
};

const pruneRecoveredCommandHistoryAccumulator = (
  accumulator: RecoveredCommandHistoryAccumulator
): void => {
  while (accumulator.terminalCommandIds.size > accumulator.maxTerminalHistory) {
    const oldestTerminalCommandId = accumulator.terminalCommandIds.keys().next().value;
    if (!oldestTerminalCommandId) break;
    accumulator.terminalCommandIds.delete(oldestTerminalCommandId);
    if (accumulator.recoverableCommandIds.has(oldestTerminalCommandId)) continue;
    accumulator.eventsByCommandId.delete(oldestTerminalCommandId);
  }
};

export const applyEventsToRecoveredCommandHistoryAccumulator = (
  accumulator: RecoveredCommandHistoryAccumulator,
  events: SimulationEvent[]
): void => {
  for (const event of events) {
    const existing = accumulator.eventsByCommandId.get(event.commandId) ?? [];
    existing.push(event);
    accumulator.eventsByCommandId.set(event.commandId, existing);
    if (isTerminalCommandEvent(event)) {
      accumulator.terminalCommandIds.delete(event.commandId);
      accumulator.terminalCommandIds.set(event.commandId, true);
    }
  }
  pruneRecoveredCommandHistoryAccumulator(accumulator);
};

export const finalizeRecoveredCommandHistoryAccumulator = (
  accumulator: RecoveredCommandHistoryAccumulator
): RecoveredCommandHistory => ({
  commands: [...accumulator.commands].sort((left, right) => left.queuedAt - right.queuedAt),
  eventsByCommandId: accumulator.eventsByCommandId
});

export const applyEventsToRecoveredCommandHistory = (
  baseHistory: RecoveredCommandHistory,
  events: SimulationEvent[],
  options?: CommandRecoveryOptions
): RecoveredCommandHistory => {
  const accumulator = createRecoveredCommandHistoryAccumulator(baseHistory, options);
  applyEventsToRecoveredCommandHistoryAccumulator(accumulator, events);
  return finalizeRecoveredCommandHistoryAccumulator(accumulator);
};
