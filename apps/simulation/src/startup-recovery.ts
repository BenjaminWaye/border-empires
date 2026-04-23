import type { SimulationCommandStore } from "./command-store.js";
import { applyEventsToRecoveredCommandHistory, recoverCommandHistory, type RecoveredCommandHistory } from "./command-recovery.js";
import type { RecoveredSimulationState } from "./event-recovery.js";
import { applySimulationEventsToRecoveredState, recoverSimulationStateFromEvents } from "./event-recovery.js";
import type { SimulationEventStore, StoredSimulationEvent } from "./event-store.js";
import type { SimulationSeedProfile } from "./seed-state.js";
import type { SimulationSnapshotStore } from "./snapshot-store.js";

export type SimulationStartupRecovery = {
  initialState: RecoveredSimulationState;
  initialCommandHistory: RecoveredCommandHistory;
  recoveredCommandCount: number;
  recoveredEventCount: number;
};

const STARTUP_RECOVERY_EVENT_BATCH_SIZE = 5_000;

const hasUsableSnapshotState = (tiles: RecoveredSimulationState["tiles"]): boolean => tiles.length > 0;

const replayEventBatches = async ({
  eventStore,
  afterEventId,
  onBatch
}: {
  eventStore: SimulationEventStore;
  afterEventId: number;
  onBatch: (events: StoredSimulationEvent[]) => void;
}): Promise<number> => {
  let cursor = afterEventId;
  let recoveredEventCount = 0;
  while (true) {
    const batch = await eventStore.loadEventsAfter(cursor, STARTUP_RECOVERY_EVENT_BATCH_SIZE);
    if (batch.length === 0) break;
    recoveredEventCount += batch.length;
    onBatch(batch);
    cursor = batch.at(-1)?.eventId ?? cursor;
    if (batch.length < STARTUP_RECOVERY_EVENT_BATCH_SIZE) break;
  }
  return recoveredEventCount;
};

export const loadSimulationStartupRecovery = async ({
  commandStore,
  eventStore,
  snapshotStore,
  seedProfile,
  bootstrapState,
  requireDurableState
}: {
  commandStore: SimulationCommandStore;
  eventStore: SimulationEventStore;
  snapshotStore?: SimulationSnapshotStore;
  seedProfile?: SimulationSeedProfile;
  bootstrapState?: RecoveredSimulationState;
  requireDurableState?: boolean;
}): Promise<SimulationStartupRecovery> => {
  const [recoverableCommands, latestSnapshot] = await Promise.all([
    commandStore.loadRecoverableCommands(),
    snapshotStore?.loadLatestSnapshot()
  ]);
  const usableSnapshot =
    latestSnapshot && hasUsableSnapshotState(latestSnapshot.snapshotPayload.initialState.tiles) ? latestSnapshot : undefined;
  const hasBootstrapState = Boolean(bootstrapState && hasUsableSnapshotState(bootstrapState.tiles));
  let initialState = usableSnapshot
    ? usableSnapshot.snapshotPayload.initialState
    : hasBootstrapState
      ? bootstrapState!
      : recoverSimulationStateFromEvents([], seedProfile ?? "default");
  let initialCommandHistory = usableSnapshot
    ? {
        commands: [...recoverableCommands].sort((left, right) => left.queuedAt - right.queuedAt),
        eventsByCommandId: new Map(
          usableSnapshot.snapshotPayload.commandEvents.map((entry) => [entry.commandId, [...entry.events]])
        )
      }
    : recoverCommandHistory(recoverableCommands, []);
  const recoveredEventCount = await replayEventBatches({
    eventStore,
    afterEventId: usableSnapshot?.lastAppliedEventId ?? 0,
    onBatch: (events) => {
      const eventPayloads = events.map((event) => event.eventPayload);
      initialState = applySimulationEventsToRecoveredState(initialState, eventPayloads);
      initialCommandHistory = applyEventsToRecoveredCommandHistory(initialCommandHistory, eventPayloads);
    }
  });
  if (requireDurableState && !usableSnapshot && recoveredEventCount === 0 && !hasBootstrapState) {
    throw new Error("simulation startup recovery requires durable state but no snapshot, events, or bootstrap state were found");
  }

  return {
    initialState,
    initialCommandHistory,
    recoveredCommandCount: recoverableCommands.length,
    recoveredEventCount
  };
};
