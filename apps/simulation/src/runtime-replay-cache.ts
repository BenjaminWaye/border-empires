import { usesPlayerCommandSequence, type CommandEnvelope, type SimulationEvent } from "@border-empires/sim-protocol";

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

  /** Replays a durable result, or reserves a real player's sequence before queuing. */
  replayOrRegister(command: CommandEnvelope, emit: (event: SimulationEvent) => void): boolean {
    this.pruneReplayCaches();
    if (this.isTerminalOnlyReplayCommand(command.commandId)) return true;
    const replay = (id: string): boolean => {
      const events = this.recordedEventsByCommandId.get(id);
      if (!events) return false;
      for (const event of events) emit(event);
      return true;
    };
    if (replay(command.commandId)) return true;
    if (usesPlayerCommandSequence(command.type) && command.type !== "CHECK_STRANDED_REGION") {
      const key = `${command.playerId}:${command.clientSeq}`;
      const existing = this.commandIdsByPlayerSeq.get(key);
      if (existing && (this.isTerminalOnlyReplayCommand(existing) || replay(existing))) return true;
      this.commandIdsByPlayerSeq.set(key, command.commandId);
    }
    return false;
  }

  get serverEventsSkipped(): number {
    return this.serverEventsSkippedCount;
  }

  get recordedHistoryEvicted(): number {
    return this.recordedHistoryEvictedCount;
  }

  /**
   * Replay-cache observability (counter-on-skip rule). `recordedCommandHistorySize`
   * is the number of commands whose events are embedded in each snapshot — the
   * value that previously leaked to 122k/37MB. `serverEventsSkipped` counts events
   * excluded as server-generated; `recordedHistoryEvicted` counts hard-cap
   * evictions (non-zero means an unforeseen server prefix is leaking).
   */
  stats(): { recordedCommandHistorySize: number; serverEventsSkipped: number; recordedHistoryEvicted: number } {
    return {
      recordedCommandHistorySize: this.recordedEventsByCommandId.size,
      serverEventsSkipped: this.serverEventsSkippedCount,
      recordedHistoryEvicted: this.recordedHistoryEvictedCount
    };
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
    // A border diff must never be replayed: a duplicate submit re-emits the
    // recorded events, the service persists them again with a later event id,
    // and startup recovery would then re-apply a stale diff over newer ones.
    // Clients never see this sim-internal event, so there is nothing to replay.
    if (event.eventType === "REACH_BORDER_CHANGED") return;
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
