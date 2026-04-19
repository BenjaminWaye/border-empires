import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { StoredSimulationCommand } from "./command-store.js";

export type RecoveredCommandHistory = {
  commands: StoredSimulationCommand[];
  eventsByCommandId: Map<string, SimulationEvent[]>;
};

export const recoverCommandHistory = (
  commands: StoredSimulationCommand[],
  events: SimulationEvent[]
): RecoveredCommandHistory => {
  return applyEventsToRecoveredCommandHistory(
    {
      commands: [...commands].sort((left, right) => left.queuedAt - right.queuedAt),
      eventsByCommandId: new Map()
    },
    events
  );
};

export const applyEventsToRecoveredCommandHistory = (
  baseHistory: RecoveredCommandHistory,
  events: SimulationEvent[]
): RecoveredCommandHistory => {
  const eventsByCommandId = new Map<string, SimulationEvent[]>();

  for (const [commandId, existingEvents] of baseHistory.eventsByCommandId.entries()) {
    eventsByCommandId.set(commandId, [...existingEvents]);
  }

  for (const event of events) {
    const existing = eventsByCommandId.get(event.commandId) ?? [];
    existing.push(event);
    eventsByCommandId.set(event.commandId, existing);
  }

  return {
    commands: [...baseHistory.commands].sort((left, right) => left.queuedAt - right.queuedAt),
    eventsByCommandId
  };
};
