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
  const historicalEvents = usableSnapshot
    ? await (async () => {
        const events: StoredSimulationEvent[] = [];
        let cursor = usableSnapshot.lastAppliedEventId;
        while (true) {
          const batch = await eventStore.loadEventsAfter(cursor, STARTUP_RECOVERY_EVENT_BATCH_SIZE);
          if (batch.length === 0) break;
          events.push(...batch);
          cursor = batch.at(-1)?.eventId ?? cursor;
          if (batch.length < STARTUP_RECOVERY_EVENT_BATCH_SIZE) break;
        }
        return events;
      })()
    : await eventStore.loadAllEvents();
  const hasBootstrapState = Boolean(bootstrapState && hasUsableSnapshotState(bootstrapState.tiles));
  if (requireDurableState && !usableSnapshot && historicalEvents.length === 0 && !hasBootstrapState) {
    throw new Error("simulation startup recovery requires durable state but no snapshot, events, or bootstrap state were found");
  }
  const eventPayloads = historicalEvents.map((event) => event.eventPayload);
  const initialState = usableSnapshot
    ? applySimulationEventsToRecoveredState(usableSnapshot.snapshotPayload.initialState, eventPayloads)
    : hasBootstrapState
      ? applySimulationEventsToRecoveredState(bootstrapState!, eventPayloads)
      : recoverSimulationStateFromEvents(eventPayloads, seedProfile ?? "default");
  const initialCommandHistory = usableSnapshot
    ? applyEventsToRecoveredCommandHistory(
        {
          commands: [...recoverableCommands].sort((left, right) => left.queuedAt - right.queuedAt),
          eventsByCommandId: new Map(
            usableSnapshot.snapshotPayload.commandEvents.map((entry) => [entry.commandId, [...entry.events]])
          )
        },
        eventPayloads
      )
    : recoverCommandHistory(recoverableCommands, eventPayloads);

  return {
    initialState,
    initialCommandHistory,
    recoveredCommandCount: recoverableCommands.length,
    recoveredEventCount: historicalEvents.length
  };
};
