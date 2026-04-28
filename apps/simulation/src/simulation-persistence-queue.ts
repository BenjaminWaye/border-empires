import type { SimulationEvent } from "@border-empires/sim-protocol";

import type { SimulationCommandStore } from "./command-store.js";
import type { SimulationEventStore } from "./event-store.js";

type SimulationPersistenceQueueDependencies = {
  commandStore: SimulationCommandStore;
  eventStore: SimulationEventStore;
  onEventPersisted?: () => void;
  onEventStoreWrite?: (durationMs: number) => void;
  onDiagnostic?: (sample: {
    phase: "command_status" | "event_store";
    eventType: SimulationEvent["eventType"];
    commandId: string;
    durationMs: number;
    pendingCount: number;
    failed: boolean;
    operation: "markAccepted" | "markRejected" | "markResolved" | "appendEvent" | "noop";
    retryCount: number;
  }) => void;
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

const PERSISTENCE_RETRY_BACKOFF_MS = [25, 75, 150] as const;
const DEFAULT_PERSISTENCE_RETRY_BACKOFF_MS = 150;

const isTransientPersistenceError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("connection terminated") ||
    message.includes("connection reset")
  );
};

const delay = async (ms: number): Promise<void> =>
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const withPersistenceRetry = async (operation: () => Promise<void>): Promise<{ retryCount: number }> => {
  let attempt = 0;
  let lastError: unknown;
  const maxAttempts = PERSISTENCE_RETRY_BACKOFF_MS.length + 1;
  while (attempt < maxAttempts) {
    try {
      await operation();
      return { retryCount: attempt };
    } catch (error) {
      lastError = error;
      if (!isTransientPersistenceError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const retryDelayMs = PERSISTENCE_RETRY_BACKOFF_MS[attempt] ?? DEFAULT_PERSISTENCE_RETRY_BACKOFF_MS;
      await delay(retryDelayMs);
      attempt += 1;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
};

const persistCommandStatus = async (
  commandStore: SimulationCommandStore,
  event: SimulationEvent,
  createdAt: number
): Promise<"markAccepted" | "markRejected" | "markResolved" | "noop"> => {
  switch (event.eventType) {
    case "COMMAND_ACCEPTED":
      await commandStore.markAccepted(event.commandId, createdAt);
      return "markAccepted";
    case "COMMAND_REJECTED":
      await commandStore.markRejected(event.commandId, createdAt, event.code, event.message);
      return "markRejected";
    case "COMBAT_RESOLVED":
      await commandStore.markResolved(event.commandId, createdAt);
      return "markResolved";
    default:
      return "noop";
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
        const commandStatusStartedAt = Date.now();
        let commandStatusFailed = false;
        let commandStatusRetryCount = 0;
        let commandStatusOperation: "markAccepted" | "markRejected" | "markResolved" | "noop" = "noop";
        try {
          const result = await withPersistenceRetry(async () => {
            commandStatusOperation = await persistCommandStatus(dependencies.commandStore, event, createdAt);
          });
          commandStatusRetryCount = result.retryCount;
        } catch (error) {
          commandStatusFailed = true;
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
        } finally {
          dependencies.onDiagnostic?.({
            phase: "command_status",
            eventType: event.eventType,
            commandId: event.commandId,
            durationMs: Math.max(0, Date.now() - commandStatusStartedAt),
            pendingCount,
            failed: commandStatusFailed,
            operation: commandStatusOperation,
            retryCount: commandStatusRetryCount
          });
        }

        if (shouldPersistEvent(event)) {
          const eventStoreWriteStartedAt = Date.now();
          let eventStoreWriteFailed = false;
          let eventStoreRetryCount = 0;
          try {
            const result = await withPersistenceRetry(async () => {
              await dependencies.eventStore.appendEvent(event, createdAt);
            });
            eventStoreRetryCount = result.retryCount;
            dependencies.onEventPersisted?.();
          } catch (error) {
            eventStoreWriteFailed = true;
            markFailure();
            reportFailure(error);
            log.error("failed to persist simulation event", error);
          } finally {
            const durationMs = Math.max(0, Date.now() - eventStoreWriteStartedAt);
            dependencies.onEventStoreWrite?.(durationMs);
            dependencies.onDiagnostic?.({
              phase: "event_store",
              eventType: event.eventType,
              commandId: event.commandId,
              durationMs,
              pendingCount,
              failed: eventStoreWriteFailed,
              operation: "appendEvent",
              retryCount: eventStoreRetryCount
            });
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
