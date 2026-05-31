import type { SimulationEvent } from "@border-empires/sim-protocol";

import { isTerminalCommandEvent } from "./command-event-lifecycle.js";

export class RuntimeReplayCache {
  readonly recordedEventsByCommandId = new Map<string, SimulationEvent[]>();
  readonly commandIdsByPlayerSeq = new Map<string, string>();
  private readonly terminalReplayCommandIds = new Map<string, true>();
  private readonly terminalOnlyReplayCommandIds = new Set<string>();

  constructor(
    private readonly maxTerminalCommandReplayHistory: number,
    private readonly maxPlayerSeqReplayEntries: number
  ) {}

  rebuildTerminalReplayIndex(): void {
    this.terminalReplayCommandIds.clear();
    this.terminalOnlyReplayCommandIds.clear();
    for (const [commandId, events] of this.recordedEventsByCommandId.entries()) {
      if (events.some((event) => isTerminalCommandEvent(event))) {
        this.terminalReplayCommandIds.set(commandId, true);
      }
    }
  }

  markTerminalReplayCommand(commandId: string): void {
    this.terminalReplayCommandIds.delete(commandId);
    this.terminalReplayCommandIds.set(commandId, true);
  }

  markTerminalOnlyReplayCommand(commandId: string): void {
    this.recordedEventsByCommandId.delete(commandId);
    this.terminalOnlyReplayCommandIds.add(commandId);
  }

  dropReplayHistoryForCommand(commandId: string): void {
    this.recordedEventsByCommandId.delete(commandId);
    this.terminalReplayCommandIds.delete(commandId);
    this.terminalOnlyReplayCommandIds.delete(commandId);
    for (const [playerSeqKey, mappedCommandId] of this.commandIdsByPlayerSeq.entries()) {
      if (mappedCommandId === commandId) this.commandIdsByPlayerSeq.delete(playerSeqKey);
    }
  }

  pruneReplayCaches(): void {
    while (this.terminalReplayCommandIds.size > this.maxTerminalCommandReplayHistory) {
      const oldestTerminalCommandId = this.terminalReplayCommandIds.keys().next().value;
      if (!oldestTerminalCommandId) break;
      this.dropReplayHistoryForCommand(oldestTerminalCommandId);
    }
    while (this.commandIdsByPlayerSeq.size > this.maxPlayerSeqReplayEntries) {
      const oldestPlayerSeqKey = this.commandIdsByPlayerSeq.keys().next().value;
      if (!oldestPlayerSeqKey) break;
      const oldestCommandId = this.commandIdsByPlayerSeq.get(oldestPlayerSeqKey);
      this.commandIdsByPlayerSeq.delete(oldestPlayerSeqKey);
      if (oldestCommandId) this.terminalOnlyReplayCommandIds.delete(oldestCommandId);
    }
  }

  isTerminalOnlyReplayCommand(commandId: string): boolean {
    return this.terminalOnlyReplayCommandIds.has(commandId);
  }

  recordEvent(event: SimulationEvent): void {
    const existingEvents = this.recordedEventsByCommandId.get(event.commandId) ?? [];
    existingEvents.push(event);
    this.recordedEventsByCommandId.set(event.commandId, existingEvents);
    if (isTerminalCommandEvent(event)) this.markTerminalReplayCommand(event.commandId);
    if (event.eventType === "COMBAT_CANCELLED") {
      for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
        if (cancelledCommandId !== event.commandId) this.markTerminalOnlyReplayCommand(cancelledCommandId);
      }
    }
    this.pruneReplayCaches();
  }
}
