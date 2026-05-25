import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { StoredSimulationCommand } from "./command-store.js";
import { isTerminalCommandEvent } from "./command-event-lifecycle.js";
import type { RecoveredSimulationState } from "./event-recovery.js";
import type { ProjectionExportState } from "./postgres-projection-writer.js";

/**
 * Event types whose state is already captured elsewhere in the snapshot and
 * therefore don't need to be replayed from `commandEvents` on recovery.
 *
 * - PLAYER_MESSAGE / PLAYER_UPDATE: player gold/manpower/etc. are already
 *   embedded in the snapshot's `players[]` array.
 * - TILE_YIELD_ANCHOR_UPDATED / PLAYER_YIELD_COLLECTION_EPOCH_UPDATED:
 *   collection timestamps are already in the snapshot's dedicated yield
 *   anchor fields.
 * - TILE_DELTA_BATCH: the resulting tile state is already in
 *   `initialState.tiles` (the snapshot is post-event). The event itself is
 *   only useful to re-broadcast a delta to a reconnecting client; recovery
 *   doesn't need it to reconstruct world state.
 *
 * On staging these three event types accounted for ~99 MB of a 103 MB
 * snapshot. Dropping them at snapshot-write time has no functional impact
 * because recovery rebuilds the same state from the dedicated fields.
 */
const REDUNDANT_SNAPSHOT_EVENT_TYPES: ReadonlySet<SimulationEvent["eventType"]> = new Set([
  "PLAYER_MESSAGE",
  "TILE_YIELD_ANCHOR_UPDATED",
  "TILE_YIELD_ANCHOR_BATCH",
  "PLAYER_YIELD_COLLECTION_EPOCH_UPDATED",
  "TILE_DELTA_BATCH"
]);

const stripRedundantSnapshotEvents = (events: readonly SimulationEvent[]): SimulationEvent[] =>
  events.filter((event) => !REDUNDANT_SNAPSHOT_EVENT_TYPES.has(event.eventType));

export type StoredSnapshotCommandEvents = {
  commandId: string;
  events: SimulationEvent[];
};

export type SimulationSnapshotSections = {
  initialState: RecoveredSimulationState;
  commandEvents: StoredSnapshotCommandEvents[];
};

export type SimulationSnapshotPayload = {
  initialState: RecoveredSimulationState;
  commandEvents: StoredSnapshotCommandEvents[];
};

export type StoredSimulationSnapshot = {
  snapshotId?: number;
  lastAppliedEventId: number;
  snapshotPayload: SimulationSnapshotPayload;
  createdAt: number;
};

const cancelledCommandIdsFromEvents = (eventsByCommandId: ReadonlyMap<string, SimulationEvent[]>): Set<string> => {
  const cancelledCommandIds = new Set<string>();
  for (const events of eventsByCommandId.values()) {
    for (const event of events) {
      if (event.eventType !== "COMBAT_CANCELLED") continue;
      for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
        cancelledCommandIds.add(cancelledCommandId);
      }
    }
  }
  return cancelledCommandIds;
};

export type SimulationSnapshotStore = {
  saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
    /** When provided, implementations may write projection tables alongside the snapshot. */
    projectionState?: ProjectionExportState;
  }): Promise<void>;
  loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined>;
};

export const buildSimulationSnapshotSections = ({
  initialState,
  commands,
  eventsByCommandId
}: {
  initialState: RecoveredSimulationState;
  commands: StoredSimulationCommand[];
  eventsByCommandId: Map<string, SimulationEvent[]>;
}): SimulationSnapshotSections => {
  const cancelledCommandIds = cancelledCommandIdsFromEvents(eventsByCommandId);
  return {
    initialState,
    commandEvents: commands
      .filter((command) => command.status === "QUEUED" || command.status === "ACCEPTED")
      .filter((command) => !cancelledCommandIds.has(command.commandId))
      .filter((command) => eventsByCommandId.has(command.commandId))
      .map((command) => ({
        commandId: command.commandId,
        events: stripRedundantSnapshotEvents(eventsByCommandId.get(command.commandId) ?? [])
      }))
      .filter((entry) => entry.events.length > 0)
  };
};

export const buildSimulationSnapshotCommandEvents = (
  eventsByCommandId: ReadonlyMap<string, SimulationEvent[]>
): StoredSnapshotCommandEvents[] => {
  const cancelledCommandIds = cancelledCommandIdsFromEvents(eventsByCommandId);
  return [...eventsByCommandId.entries()]
    .filter(([commandId]) => !cancelledCommandIds.has(commandId))
    .filter(([, events]) => !events.some(isTerminalCommandEvent))
    .map(([commandId, events]) => ({
      commandId,
      events: stripRedundantSnapshotEvents(events)
    }))
    .filter((entry) => entry.events.length > 0)
    .sort((left, right) => left.commandId.localeCompare(right.commandId));
};

export const buildSimulationSnapshotPayload = (
  sections: SimulationSnapshotSections
): SimulationSnapshotPayload => ({
  initialState: sections.initialState,
  commandEvents: sections.commandEvents
});

export class InMemorySimulationSnapshotStore implements SimulationSnapshotStore {
  private nextSnapshotId = 1;
  private snapshots: StoredSimulationSnapshot[] = [];

  async saveSnapshot(snapshot: {
    lastAppliedEventId: number;
    snapshotSections: SimulationSnapshotSections;
    createdAt: number;
    projectionState?: ProjectionExportState;
  }): Promise<void> {
    this.snapshots.push({
      snapshotId: this.nextSnapshotId++,
      lastAppliedEventId: snapshot.lastAppliedEventId,
      snapshotPayload: buildSimulationSnapshotPayload(snapshot.snapshotSections),
      createdAt: snapshot.createdAt
    });
    this.snapshots = this.snapshots.sort((left, right) => left.createdAt - right.createdAt);
  }

  async loadLatestSnapshot(): Promise<StoredSimulationSnapshot | undefined> {
    return this.snapshots.at(-1);
  }
}
