import type { CommandEnvelope, SimulationEvent } from "@border-empires/sim-protocol";

import type { SimulationCommandStore } from "../command-store/command-store.js";
import type { SimulationEventStore } from "../event-store/event-store.js";
import { isPersistenceConstraintViolation } from "../persistence-constraint-violation/persistence-constraint-violation.js";

type SimulationPersistenceQueueDependencies = {
  commandStore: SimulationCommandStore;
  eventStore: SimulationEventStore;
  onEventPersisted?: () => void;
  onEventStoreWrite?: (durationMs: number) => void;
  onDiagnostic?: (sample: {
    phase: "command_status" | "event_store" | "queued_command";
    eventType: SimulationEvent["eventType"] | "COMMAND_QUEUED";
    commandId: string;
    durationMs: number;
    pendingCount: number;
    failed: boolean;
    operation: "markAccepted" | "markRejected" | "markResolved" | "persistQueuedCommand" | "appendEvent" | "noop";
    retryCount: number;
  }) => void;
  onPersistenceFailure?: (error: Error) => void;
  retryBackoffMs?: readonly number[];
  log?: Pick<Console, "error">;
};

type SimulationPersistenceQueue = {
  enqueueEvent(event: SimulationEvent, createdAt?: number): void;
  /**
   * Persists the initial QUEUED row for a command before it's applied.
   * Must be called (and therefore chained onto the same drain ordering)
   * before the corresponding COMMAND_ACCEPTED/COMMAND_REJECTED event is
   * enqueued via enqueueEvent, otherwise markAccepted/markRejected silently
   * no-op against a row that doesn't exist yet — see ai-debugging docs for
   * why /admin/debug/ai's recentCommands depends on this ordering.
   */
  enqueueQueuedCommand(command: CommandEnvelope, queuedAt: number): void;
  whenIdle(): Promise<void>;
  pendingCount(): number;
  isDegraded(): boolean;
  lastFailureAt(): number | undefined;
};

const noopLogger: Pick<Console, "error"> = {
  error: () => undefined
};

const DEFAULT_PERSISTENCE_RETRY_BACKOFF_MS: readonly number[] = [250, 1_000, 5_000, 15_000, 30_000];

const isTransientPersistenceError = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    // Legacy Postgres transient errors (kept for dev environments)
    message.includes("timeout") ||
    message.includes("timed out") ||
    message.includes("econnreset") ||
    message.includes("connection terminated") ||
    message.includes("connection reset") ||
    // SQLite transient contention errors. SQLITE_BUSY ("database is locked")
    // fires when a WAL checkpoint auto-triggered by the reader connection
    // races with a writer write. The writer's busy_timeout=5000ms exhausts
    // before the checkpoint clears; the 250ms first-retry window is enough
    // for the checkpoint to release.
    message.includes("database is locked") ||
    message.includes("sqlite_busy") ||
    message.includes("sqlite_locked")
  );
};

const delay = async (ms: number): Promise<void> =>
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const withPersistenceRetry = async (
  operation: () => Promise<void>,
  backoffMs: readonly number[]
): Promise<{ retryCount: number }> => {
  let attempt = 0;
  let lastError: unknown;
  const maxAttempts = backoffMs.length + 1;
  while (attempt < maxAttempts) {
    try {
      await operation();
      return { retryCount: attempt };
    } catch (error) {
      lastError = error;
      if (!isTransientPersistenceError(error) || attempt >= maxAttempts - 1) {
        throw error;
      }
      const retryDelayMs = backoffMs[attempt] ?? backoffMs[backoffMs.length - 1] ?? 0;
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
    case "COMBAT_CANCELLED":
      await commandStore.markResolved(event.commandId, createdAt);
      for (const cancelledCommandId of event.cancelledCommandIds ?? []) {
        if (cancelledCommandId !== event.commandId) {
          await commandStore.markResolved(cancelledCommandId, createdAt);
        }
      }
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
  const retryBackoffMs = dependencies.retryBackoffMs ?? DEFAULT_PERSISTENCE_RETRY_BACKOFF_MS;
  let drain = Promise.resolve();
  let pendingCount = 0;
  let degradedUntil = 0;
  let lastFailureAt: number | undefined;

  const markFailure = (): void => {
    const now = Date.now();
    lastFailureAt = now;
    degradedUntil = Math.max(degradedUntil, now + 30_000);
  };

  // Constraint violations are deterministic (e.g. a duplicate client_seq):
  // retrying or waiting out a backpressure window recovers nothing, so they
  // must not trip degraded mode the way transient durability failures do.
  const markFailureUnlessConstraintViolation = (error: unknown): void => {
    if (error instanceof Error && isPersistenceConstraintViolation(error)) return;
    markFailure();
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
          }, retryBackoffMs);
          commandStatusRetryCount = result.retryCount;
        } catch (error) {
          commandStatusFailed = true;
          markFailureUnlessConstraintViolation(error);
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
            case "COMBAT_CANCELLED":
              log.error("failed to persist simulation command cancellation", error);
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
            }, retryBackoffMs);
            eventStoreRetryCount = result.retryCount;
            dependencies.onEventPersisted?.();
          } catch (error) {
            eventStoreWriteFailed = true;
            markFailureUnlessConstraintViolation(error);
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

  const enqueueQueuedCommand = (command: CommandEnvelope, queuedAt: number): void => {
    pendingCount += 1;
    const persistTask = async () => {
      const startedAt = Date.now();
      let failed = false;
      let retryCount = 0;
      try {
        const result = await withPersistenceRetry(async () => {
          await dependencies.commandStore.persistQueuedCommand(command, queuedAt);
        }, retryBackoffMs);
        retryCount = result.retryCount;
      } catch (error) {
        failed = true;
        markFailureUnlessConstraintViolation(error);
        reportFailure(error);
        log.error("failed to persist queued simulation command", error);
      } finally {
        dependencies.onDiagnostic?.({
          phase: "queued_command",
          eventType: "COMMAND_QUEUED",
          commandId: command.commandId,
          durationMs: Math.max(0, Date.now() - startedAt),
          pendingCount,
          failed,
          operation: "persistQueuedCommand",
          retryCount
        });
        pendingCount = Math.max(0, pendingCount - 1);
        markSuccess();
      }
    };

    drain = drain.then(persistTask, persistTask);
  };

  return {
    enqueueEvent,
    enqueueQueuedCommand,
    whenIdle: () => drain,
    pendingCount: () => pendingCount,
    isDegraded: () => Date.now() < degradedUntil,
    lastFailureAt: () => lastFailureAt
  };
};
