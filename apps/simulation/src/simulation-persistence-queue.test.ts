import { describe, expect, it, vi } from "vitest";

import { InMemorySimulationCommandStore } from "./command-store.js";
import { InMemorySimulationEventStore } from "./event-store.js";
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

  it("continues draining after a persistence failure and still appends later events", async () => {
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

    expect(markAcceptedSpy).toHaveBeenCalledTimes(1);
    expect(appendSpy).toHaveBeenCalledTimes(2);
    expect(log.error).toHaveBeenCalledWith("failed to persist simulation command acceptance", error);
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
    vi.spyOn(eventStore, "appendEvent").mockRejectedValueOnce(new Error("db timeout"));
    const queue = createSimulationPersistenceQueue({ commandStore, eventStore, log: { error: vi.fn() } });

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
    vi.spyOn(eventStore, "appendEvent").mockRejectedValueOnce(failure);
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

    expect(onPersistenceFailure).toHaveBeenCalledWith(failure);
  });
});
