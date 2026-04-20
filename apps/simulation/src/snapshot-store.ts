import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { StoredSimulationCommand } from "./command-store.js";
import type { RecoveredSimulationState } from "./event-recovery.js";
import type { ProjectionExportState } from "./postgres-projection-writer.js";

const isTerminalCommandEvent = (event: SimulationEvent): boolean =>
  event.eventType === "COMMAND_REJECTED" || event.eventType === "COMBAT_RESOLVED";

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
}): SimulationSnapshotSections => ({
  initialState,
  commandEvents: commands
    .filter((command) => command.status === "QUEUED" || command.status === "ACCEPTED")
    .filter((command) => eventsByCommandId.has(command.commandId))
    .map((command) => ({
      commandId: command.commandId,
      events: [...(eventsByCommandId.get(command.commandId) ?? [])]
    }))
});

export const buildSimulationSnapshotCommandEvents = (
  eventsByCommandId: ReadonlyMap<string, SimulationEvent[]>
): StoredSnapshotCommandEvents[] =>
  [...eventsByCommandId.entries()]
    .filter(([, events]) => !events.some(isTerminalCommandEvent))
    .map(([commandId, events]) => ({
      commandId,
      events: [...events]
    }))
    .sort((left, right) => left.commandId.localeCompare(right.commandId));

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
