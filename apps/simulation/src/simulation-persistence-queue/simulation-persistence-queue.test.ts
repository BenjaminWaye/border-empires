import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "../command-store/command-store.js";
import { InMemorySimulationEventStore } from "../event-store/event-store.js";
import { createSimulationPersistenceQueue } from "./simulation-persistence-queue.js";

const createDeferred = () => {
  let resolve: (() => void) | undefined;
  const promise = new Promise<void>((innerResolve) => {
    resolve = innerResolve;
  });
  return {
    promise,
    resolve: () => resolve?.()
  };
};

describe("createSimulationPersistenceQueue", () => {
  it("serializes persistence so a later event does not start until the earlier one finishes", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const firstAppend = createDeferred();
    const eventStore = new InMemorySimulationEventStore();
    const appendSpy = vi
      .spyOn(eventStore, "appendEvent")
      .mockImplementationOnce(async () => firstAppend.promise)
      .mockImplementation(async (event, createdAt) => {
        await InMemorySimulationEventStore.prototype.appendEvent.call(eventStore, event, createdAt);
      });
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "EXPAND",
        originX: 1,
        originY: 1,
        targetX: 2,
        targetY: 1,
        resolvesAt: 123
      },
      100
    );
    queue.enqueueEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-2",
        playerId: "player-2",
        code: "BAD_COMMAND",
        message: "nope"
      },
      200
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(appendSpy).toHaveBeenCalledTimes(1);

    firstAppend.resolve();
    await queue.whenIdle();

    expect(appendSpy).toHaveBeenCalledTimes(2);
  });

  it("continues draining after a transient persistence failure and still appends later events", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const error = new Error("db timeout");
    const log = { error: vi.fn() };
    const markAcceptedSpy = vi.spyOn(commandStore, "markAccepted").mockRejectedValueOnce(error);
    const appendSpy = vi.spyOn(eventStore, "appendEvent");
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore, log });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "EXPAND",
        originX: 1,
        originY: 1,
        targetX: 2,
        targetY: 1,
        resolvesAt: 123
      },
      100
    );
    queue.enqueueEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-2",
        playerId: "player-2",
        code: "BAD_COMMAND",
        message: "nope"
      },
      200
    );

    await queue.whenIdle();

    expect(markAcceptedSpy).toHaveBeenCalledTimes(2);
    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(log.error).not.toHaveBeenCalled();
    expect(await eventStore.loadEventsForCommand("cmd-2")).toHaveLength(1);
  });

  it("does not persist derived player message events and clears backlog after drain", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const appendSpy = vi.spyOn(eventStore, "appendEvent");
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore });

    queue.enqueueEvent(
      {
        eventType: "PLAYER_MESSAGE",
        commandId: "cmd-player-update",
        playerId: "player-1",
        messageType: "PLAYER_UPDATE",
        payloadJson: JSON.stringify({ type: "PLAYER_UPDATE", gold: 10 })
      },
      100
    );

    expect(queue.pendingCount()).toBe(1);
    await queue.whenIdle();

    expect(appendSpy).not.toHaveBeenCalled();
    expect(queue.pendingCount()).toBe(0);
    expect(queue.isDegraded()).toBe(false);
  });

  it("marks the queue degraded after a persistence failure", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    vi.spyOn(eventStore, "appendEvent").mockRejectedValue(new Error("db timeout"));
    const queue = createSimulationPersistenceQueue({
      commandStore,
      eventStore,
      retryBackoffMs: [0, 0, 0],
      log: { error: vi.fn() }
    });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "nope"
      },
      100
    );

    await queue.whenIdle();

    expect(queue.isDegraded()).toBe(true);
    expect(queue.lastFailureAt()).toBeTypeOf("number");
  });

  it("reports persistence failures to the fatal failure callback", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const failure = new Error("db timeout");
    const onPersistenceFailure = vi.fn();
    vi.spyOn(eventStore, "appendEvent").mockRejectedValue(failure);
    const queue = createSimulationPersistenceQueue({
      commandStore,
      eventStore,
      onPersistenceFailure,
      retryBackoffMs: [0, 0, 0],
      log: { error: vi.fn() }
    });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "nope"
      },
      100
    );

    await queue.whenIdle();

    expect(onPersistenceFailure).toHaveBeenCalledWith(failure);
  });

  it("emits diagnostics for command status and event store phases", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const onDiagnostic = vi.fn();
    const queue = createSimulationPersistenceQueue({
      commandStore,
      eventStore,
      onDiagnostic
    });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        playerId: "player-1",
        actionType: "EXPAND",
        originX: 1,
        originY: 1,
        targetX: 2,
        targetY: 1,
        resolvesAt: 123
      },
      100
    );

    await queue.whenIdle();

    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "command_status",
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        failed: false,
        operation: "markAccepted",
        retryCount: 0
      })
    );
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "event_store",
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-1",
        failed: false,
        operation: "appendEvent",
        retryCount: 0
      })
    );
  });

  it("rides out a multi-attempt transient outage when the retry budget covers it", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const onPersistenceFailure = vi.fn();
    const appendSpy = vi
      .spyOn(eventStore, "appendEvent")
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockImplementation(async (event, createdAt) => {
        await InMemorySimulationEventStore.prototype.appendEvent.call(eventStore, event, createdAt);
      });
    const queue = createSimulationPersistenceQueue({
      commandStore,
      eventStore,
      onPersistenceFailure,
      retryBackoffMs: [0, 0, 0, 0, 0],
      log: { error: vi.fn() }
    });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "nope"
      },
      100
    );

    await queue.whenIdle();

    expect(appendSpy).toHaveBeenCalledTimes(4);
    expect(onPersistenceFailure).not.toHaveBeenCalled();
    expect(queue.isDegraded()).toBe(false);
  });

  it("retries a transient event-store timeout and does not report a fatal failure when recovery succeeds", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const onPersistenceFailure = vi.fn();
    const appendSpy = vi
      .spyOn(eventStore, "appendEvent")
      .mockRejectedValueOnce(new Error("Query read timeout"))
      .mockImplementation(async (event, createdAt) => {
        await InMemorySimulationEventStore.prototype.appendEvent.call(eventStore, event, createdAt);
      });
    const queue = createSimulationPersistenceQueue({
      commandStore,
      eventStore,
      onPersistenceFailure,
      log: { error: vi.fn() }
    });

    queue.enqueueEvent(
      {
        eventType: "COMMAND_REJECTED",
        commandId: "cmd-1",
        playerId: "player-1",
        code: "BAD_COMMAND",
        message: "nope"
      },
      100
    );

    await queue.whenIdle();

    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(onPersistenceFailure).not.toHaveBeenCalled();
  });

  it("marks cancelled frontier commands resolved when a cancel event persists", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore });

    await commandStore.persistQueuedCommand(
      {
        commandId: "expand-cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 100,
        type: "EXPAND",
        payloadJson: "{}"
      },
      100
    );
    await commandStore.markAccepted("expand-cmd-1", 110);
    await commandStore.persistQueuedCommand(
      {
        commandId: "cancel-capture-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 2,
        issuedAt: 120,
        type: "CANCEL_CAPTURE",
        payloadJson: "{}"
      },
      120
    );

    queue.enqueueEvent(
      {
        eventType: "COMBAT_CANCELLED",
        commandId: "cancel-capture-1",
        playerId: "player-1",
        count: 1,
        cancelledCommandIds: ["expand-cmd-1"]
      },
      130
    );
    await queue.whenIdle();

    await expect(commandStore.get("cancel-capture-1")).resolves.toMatchObject({ status: "RESOLVED", resolvedAt: 130 });
    await expect(commandStore.get("expand-cmd-1")).resolves.toMatchObject({ status: "RESOLVED", resolvedAt: 130 });
  });

  // Regression: /admin/debug/ai's recentCommands (and loadAllCommands in
  // general) read commandStore.loadAllCommands(), which for the SQLite store
  // is an INNER JOIN between the commands and command_results tables. Before
  // enqueueQueuedCommand existed, nothing ever called persistQueuedCommand,
  // so markAccepted/markRejected always ran against a row that was never
  // inserted and silently no-opped — command history was permanently empty.
  it("enqueueQueuedCommand persists the row a later ACCEPTED event needs to update", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore });

    queue.enqueueQueuedCommand(
      {
        commandId: "cmd-queued-1",
        sessionId: "session-1",
        playerId: "ai-1",
        clientSeq: 1,
        issuedAt: 100,
        type: "EXPAND",
        payloadJson: "{}"
      },
      100
    );
    queue.enqueueEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-queued-1",
        playerId: "ai-1",
        actionType: "EXPAND",
        originX: 1,
        originY: 1,
        targetX: 2,
        targetY: 1,
        resolvesAt: 123
      },
      110
    );

    await queue.whenIdle();

    await expect(commandStore.get("cmd-queued-1")).resolves.toMatchObject({
      status: "ACCEPTED",
      playerId: "ai-1",
      type: "EXPAND",
      acceptedAt: 110
    });
    await expect(commandStore.loadAllCommands()).resolves.toContainEqual(
      expect.objectContaining({ commandId: "cmd-queued-1", status: "ACCEPTED" })
    );
  });

  it("preserves call order between enqueueQueuedCommand and enqueueEvent for the same command", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const persistSpy = vi.spyOn(commandStore, "persistQueuedCommand");
    const markAcceptedSpy = vi.spyOn(commandStore, "markAccepted");
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore });

    queue.enqueueQueuedCommand(
      { commandId: "cmd-order-1", sessionId: "s", playerId: "ai-1", clientSeq: 1, issuedAt: 100, type: "EXPAND", payloadJson: "{}" },
      100
    );
    queue.enqueueEvent(
      {
        eventType: "COMMAND_ACCEPTED",
        commandId: "cmd-order-1",
        playerId: "ai-1",
        actionType: "EXPAND",
        originX: 1,
        originY: 1,
        targetX: 2,
        targetY: 1,
        resolvesAt: 123
      },
      110
    );

    await queue.whenIdle();

    expect(persistSpy.mock.invocationCallOrder[0]).toBeLessThan(markAcceptedSpy.mock.invocationCallOrder[0]!);
  });

  it("emits a queued_command diagnostic and clears pendingCount on success", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const onDiagnostic = vi.fn();
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore, onDiagnostic });

    queue.enqueueQueuedCommand(
      { commandId: "cmd-diag-1", sessionId: "s", playerId: "ai-1", clientSeq: 1, issuedAt: 100, type: "EXPAND", payloadJson: "{}" },
      100
    );
    expect(queue.pendingCount()).toBe(1);

    await queue.whenIdle();

    expect(queue.pendingCount()).toBe(0);
    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "queued_command",
        eventType: "COMMAND_QUEUED",
        commandId: "cmd-diag-1",
        failed: false,
        operation: "persistQueuedCommand",
        retryCount: 0
      })
    );
  });

  it("marks the queue degraded and reports the fatal callback when persistQueuedCommand keeps failing", async () => {
    const commandStore = new InMemorySimulationCommandStore();
    const eventStore = new InMemorySimulationEventStore();
    const failure = new Error("db timeout");
    const onPersistenceFailure = vi.fn();
    vi.spyOn(commandStore, "persistQueuedCommand").mockRejectedValue(failure);
    const queue = createSimulationPersistenceQueue({
      commandStore,
      eventStore,
      onPersistenceFailure,
      retryBackoffMs: [0, 0, 0],
      log: { error: vi.fn() }
    });

    queue.enqueueQueuedCommand(
      { commandId: "cmd-fail-1", sessionId: "s", playerId: "ai-1", clientSeq: 1, issuedAt: 100, type: "EXPAND", payloadJson: "{}" },
      100
    );

    await queue.whenIdle();

    expect(queue.isDegraded()).toBe(true);
    expect(onPersistenceFailure).toHaveBeenCalledWith(failure);
  });
});
