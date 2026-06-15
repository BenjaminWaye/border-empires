import type { SimulationEvent } from "@border-empires/sim-protocol";

import {
  DEFAULT_MAX_RECORDED_COMMAND_HISTORY,
  isReplayTrackedCommandId,
  isTerminalCommandEvent
} from "./command-event-lifecycle.js";

export class RuntimeReplayCache {
  readonly recordedEventsByCommandId = new Map<string, SimulationEvent[]>();
  readonly commandIdsByPlayerSeq = new Map<string, string>();
  private readonly terminalReplayCommandIds = new Map<string, true>();
  private readonly terminalOnlyReplayCommandIds = new Set<string>();
  // Observability for the counter-on-every-skip rule: how many server-generated
  // events were skipped, and how many entries the hard cap had to evict.
  private serverEventsSkippedCount = 0;
  private recordedHistoryEvictedCount = 0;
  private readonly maxRecordedCommandHistory: number;

  constructor(
    private readonly maxTerminalCommandReplayHistory: number,
    private readonly maxPlayerSeqReplayEntries: number,
    maxRecordedCommandHistory: number = DEFAULT_MAX_RECORDED_COMMAND_HISTORY
  ) {
    this.maxRecordedCommandHistory = Math.max(1, maxRecordedCommandHistory);
  }

  get serverEventsSkipped(): number {
    return this.serverEventsSkippedCount;
  }

  get recordedHistoryEvicted(): number {
    return this.recordedHistoryEvictedCount;
  }

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
    // Hard backstop: never let the recorded-events map grow unbounded regardless
    // of command classification. Evicts oldest (insertion order) first.
    while (this.recordedEventsByCommandId.size > this.maxRecordedCommandHistory) {
      const oldestCommandId = this.recordedEventsByCommandId.keys().next().value;
      if (!oldestCommandId) break;
      this.dropReplayHistoryForCommand(oldestCommandId);
      this.recordedHistoryEvictedCount += 1;
    }
  }

  isTerminalOnlyReplayCommand(commandId: string): boolean {
    return this.terminalOnlyReplayCommandIds.has(commandId);
  }

  recordEvent(event: SimulationEvent): void {
    // Server-generated commands (AI/system planners, territory automation,
    // economy accrual, recovery synthetics) are never client-resubmitted, so we
    // skip replay tracking for them — recording their events leaked unboundedly
    // and bloated the checkpoint snapshot. We still process COMBAT_CANCELLED's
    // cancelledCommandIds below, since those can reference real client commands.
    if (isReplayTrackedCommandId(event.commandId)) {
      const existingEvents = this.recordedEventsByCommandId.get(event.commandId) ?? [];
      existingEvents.push(event);
      this.recordedEventsByCommandId.set(event.commandId, existingEvents);
      if (isTerminalCommandEvent(event)) this.markTerminalReplayCommand(event.commandId);
    } else {
      this.serverEventsSkippedCount += 1;
    }
    if (event.eventType === "COMBAT_CANCELLED") {
      for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
        if (cancelledCommandId !== event.commandId) this.markTerminalOnlyReplayCommand(cancelledCommandId);
      }
    }
    this.pruneReplayCaches();
  }
}
