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

const resolveMaxTerminalHistory = (options?: CommandRecoveryOptions): number =>
  Math.max(0, options?.maxTerminalCommandReplayHistory ?? DEFAULT_MAX_TERMINAL_COMMAND_REPLAY_HISTORY);

export const recoverCommandHistory = (
  commands: StoredSimulationCommand[],
  events: SimulationEvent[],
  options?: CommandRecoveryOptions
): RecoveredCommandHistory => {
  return applyEventsToRecoveredCommandHistory(
    {
      commands: [...commands].sort((left, right) => left.queuedAt - right.queuedAt),
      eventsByCommandId: new Map()
    },
    events,
    options
  );
};

export const applyEventsToRecoveredCommandHistory = (
  baseHistory: RecoveredCommandHistory,
  events: SimulationEvent[],
  options?: CommandRecoveryOptions
): RecoveredCommandHistory => {
  const eventsByCommandId = new Map<string, SimulationEvent[]>();
  const terminalCommandIds = new Map<string, true>();
  const maxTerminalHistory = resolveMaxTerminalHistory(options);
  const recoverableCommandIds = new Set(baseHistory.commands.map((command) => command.commandId));

  for (const [commandId, existingEvents] of baseHistory.eventsByCommandId.entries()) {
    const clonedEvents = [...existingEvents];
    eventsByCommandId.set(commandId, clonedEvents);
    if (clonedEvents.some(isTerminalCommandEvent)) {
      terminalCommandIds.set(commandId, true);
    }
  }

  for (const event of events) {
    const existing = eventsByCommandId.get(event.commandId) ?? [];
    existing.push(event);
    eventsByCommandId.set(event.commandId, existing);
    if (isTerminalCommandEvent(event)) {
      terminalCommandIds.delete(event.commandId);
      terminalCommandIds.set(event.commandId, true);
    }
  }

  while (terminalCommandIds.size > maxTerminalHistory) {
    const oldestTerminalCommandId = terminalCommandIds.keys().next().value;
    if (!oldestTerminalCommandId) break;
    terminalCommandIds.delete(oldestTerminalCommandId);
    if (recoverableCommandIds.has(oldestTerminalCommandId)) continue;
    eventsByCommandId.delete(oldestTerminalCommandId);
  }

  return {
    commands: [...baseHistory.commands].sort((left, right) => left.queuedAt - right.queuedAt),
    eventsByCommandId
  };
};
