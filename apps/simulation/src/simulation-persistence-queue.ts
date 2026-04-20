import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { SimulationCommandStore } from "./command-store.js";
import type { SimulationEventStore } from "./event-store.js";

type SimulationPersistenceQueueDependencies = {
  commandStore: SimulationCommandStore;
  eventStore: SimulationEventStore;
  onEventPersisted?: () => void;
  onPersistenceFailure?: (error: Error) => void;
  log?: Pick<Console, "error">;
};

type SimulationPersistenceQueue = {
  enqueueEvent(event: SimulationEvent, createdAt?: number): void;
  whenIdle(): Promise<void>;
  pendingCount(): number;
  isDegraded(): boolean;
  lastFailureAt(): number | undefined;
};

const noopLogger: Pick<Console, "error"> = {
  error: () => undefined
};

const persistCommandStatus = async (
  commandStore: SimulationCommandStore,
  event: SimulationEvent,
  createdAt: number
): Promise<void> => {
  switch (event.eventType) {
    case "COMMAND_ACCEPTED":
      await commandStore.markAccepted(event.commandId, createdAt);
      break;
    case "COMMAND_REJECTED":
      await commandStore.markRejected(event.commandId, createdAt, event.code, event.message);
      break;
    case "COMBAT_RESOLVED":
      await commandStore.markResolved(event.commandId, createdAt);
      break;
    default:
      break;
  }
};

const shouldPersistEvent = (event: SimulationEvent): boolean => event.eventType !== "PLAYER_MESSAGE";

export const createSimulationPersistenceQueue = (
  dependencies: SimulationPersistenceQueueDependencies
): SimulationPersistenceQueue => {
  const log = dependencies.log ?? noopLogger;
  let drain = Promise.resolve();
  let pendingCount = 0;
  let degradedUntil = 0;
  let lastFailureAt: number | undefined;

  const markFailure = (): void => {
    const now = Date.now();
    lastFailureAt = now;
    degradedUntil = Math.max(degradedUntil, now + 30_000);
  };

  const reportFailure = (error: unknown): void => {
    const failure = error instanceof Error ? error : new Error(String(error));
    dependencies.onPersistenceFailure?.(failure);
  };

  const markSuccess = (): void => {
    if (pendingCount > 0) return;
    if (Date.now() >= degradedUntil) degradedUntil = 0;
  };

  const enqueueEvent = (event: SimulationEvent, createdAt = Date.now()): void => {
    pendingCount += 1;
    const persistTask = async () => {
      try {
        try {
          await persistCommandStatus(dependencies.commandStore, event, createdAt);
        } catch (error) {
          markFailure();
          reportFailure(error);
          switch (event.eventType) {
            case "COMMAND_ACCEPTED":
              log.error("failed to persist simulation command acceptance", error);
              break;
            case "COMMAND_REJECTED":
              log.error("failed to persist simulation command rejection", error);
              break;
            case "COMBAT_RESOLVED":
              log.error("failed to persist simulation command resolution", error);
              break;
            default:
              break;
          }
        }

        if (shouldPersistEvent(event)) {
          try {
            await dependencies.eventStore.appendEvent(event, createdAt);
            dependencies.onEventPersisted?.();
          } catch (error) {
            markFailure();
            reportFailure(error);
            log.error("failed to persist simulation event", error);
          }
        }
      } finally {
        pendingCount = Math.max(0, pendingCount - 1);
        markSuccess();
      }
    };

    drain = drain.then(persistTask, persistTask);
  };

  return {
    enqueueEvent,
    whenIdle: () => drain,
    pendingCount: () => pendingCount,
    isDegraded: () => Date.now() < degradedUntil,
    lastFailureAt: () => lastFailureAt
  };
};
