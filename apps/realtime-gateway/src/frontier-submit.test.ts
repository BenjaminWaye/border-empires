import { describe, expect, it, vi } from "vitest";

import { InMemoryGatewayCommandStore } from "./command-store.js";
import { submitDurableCommand, submitFrontierCommand } from "./frontier-submit.js";

describe("submitFrontierCommand", () => {
  it("sends queued and forwards the durable envelope to simulation", async () => {
    const payloads: unknown[] = [];
    const submitCommand = vi.fn<Parameters<typeof submitFrontierCommand>[2]["submitCommand"]>().mockResolvedValue();
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11 },
      {
        createCommandId: () => "cmd-1",
        now: () => 1234,
        commandStore: new InMemoryGatewayCommandStore(),
        submitCommand,
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([{ type: "COMMAND_QUEUED", commandId: "cmd-1", clientSeq: 1 }]);
    expect(submitCommand).toHaveBeenCalledWith({
      commandId: "cmd-1",
      clientSeq: 1,
      issuedAt: 1234,
      payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}",
      playerId: "player-1",
      sessionId: "session-1",
      type: "ATTACK"
    });
    expect(session.nextClientSeq).toBe(2);
  });

  it("surfaces simulation submission failures instead of failing silently", async () => {
    const payloads: unknown[] = [];
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11 },
      {
        createCommandId: () => "cmd-1",
        now: () => 1234,
        commandStore: new InMemoryGatewayCommandStore(),
        submitCommand: async () => {
          throw new Error("simulation unavailable");
        },
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([
      { type: "COMMAND_QUEUED", commandId: "cmd-1", clientSeq: 1 },
      {
        type: "ERROR",
        commandId: "cmd-1",
        code: "SIMULATION_UNAVAILABLE",
        message: "command could not be queued in simulation"
      }
    ]);
    expect(session.nextClientSeq).toBe(2);
  });

  it("does not claim a command was queued if gateway persistence fails first", async () => {
    const payloads: unknown[] = [];
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11 },
      {
        createCommandId: () => "cmd-1",
        now: () => 1234,
        commandStore: {
          async persistQueuedCommand() {
            throw new Error("disk full");
          },
          async markAccepted() {},
          async markRejected() {},
          async markResolved() {},
          async get() {
            return undefined;
          },
          async findByPlayerSeq() {
            return undefined;
          },
          async listUnresolvedForPlayer() {
            return [];
          },
          async nextClientSeqForPlayer() {
            return 1;
          }
        },
        submitCommand: async () => undefined,
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([
      {
        type: "ERROR",
        commandId: "cmd-1",
        code: "QUEUE_PERSIST_FAILED",
        message: "command could not be persisted by gateway"
      }
    ]);
    expect(session.nextClientSeq).toBe(2);
  });

  it("reuses the existing queued command for a duplicate player sequence", async () => {
    const payloads: unknown[] = [];
    const commandStore = new InMemoryGatewayCommandStore();
    await commandStore.persistQueuedCommand(
      {
        commandId: "cmd-existing",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 4,
        issuedAt: 1200,
        type: "ATTACK",
        payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
      },
      1201
    );

    await submitFrontierCommand(
      { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4 },
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11 },
      {
        createCommandId: () => "cmd-new",
        now: () => 1234,
        commandStore,
        submitCommand: async () => {
          throw new Error("should not submit duplicate");
        },
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([{ type: "COMMAND_QUEUED", commandId: "cmd-existing", clientSeq: 4 }]);
  });

  it("uses the client-provided command identity when present", async () => {
    const payloads: unknown[] = [];
    const submitCommand = vi.fn<Parameters<typeof submitFrontierCommand>[2]["submitCommand"]>().mockResolvedValue();
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4 };

    await submitFrontierCommand(
      session,
      {
        type: "ATTACK",
        fromX: 10,
        fromY: 10,
        toX: 10,
        toY: 11,
        commandId: "cmd-client",
        clientSeq: 9
      },
      {
        createCommandId: () => "cmd-generated",
        now: () => 1234,
        commandStore: new InMemoryGatewayCommandStore(),
        submitCommand,
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([{ type: "COMMAND_QUEUED", commandId: "cmd-client", clientSeq: 9 }]);
    expect(submitCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        commandId: "cmd-client",
        clientSeq: 9
      })
    );
    expect(session.nextClientSeq).toBe(10);
  });

  it("queues territory abandonment through the durable command path", async () => {
    const payloads: unknown[] = [];
    const submitCommand = vi.fn<Parameters<typeof submitDurableCommand>[2]["submitCommand"]>().mockResolvedValue();
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4 };

    await submitDurableCommand(
      session,
      {
        type: "UNCAPTURE_TILE",
        payload: {
          x: 20,
          y: 20
        },
        commandId: "uncapture-cmd-1",
        clientSeq: 4
      },
      {
        now: () => 1234,
        commandStore: new InMemoryGatewayCommandStore(),
        submitCommand,
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([{ type: "COMMAND_QUEUED", commandId: "uncapture-cmd-1", clientSeq: 4 }]);
    expect(submitCommand).toHaveBeenCalledWith({
      commandId: "uncapture-cmd-1",
      clientSeq: 4,
      issuedAt: 1234,
      payloadJson: "{\"x\":20,\"y\":20}",
      playerId: "player-1",
      sessionId: "session-1",
      type: "UNCAPTURE_TILE"
    });
    expect(session.nextClientSeq).toBe(5);
  });

  it("queues converter toggles through the durable command path", async () => {
    const payloads: unknown[] = [];
    const submitCommand = vi.fn<Parameters<typeof submitDurableCommand>[2]["submitCommand"]>().mockResolvedValue();
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 7 };

    await submitDurableCommand(
      session,
      {
        type: "SET_CONVERTER_STRUCTURE_ENABLED",
        payload: {
          x: 24,
          y: 24,
          enabled: true
        },
        commandId: "converter-cmd-1",
        clientSeq: 7
      },
      {
        now: () => 1234,
        commandStore: new InMemoryGatewayCommandStore(),
        submitCommand,
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([{ type: "COMMAND_QUEUED", commandId: "converter-cmd-1", clientSeq: 7 }]);
    expect(submitCommand).toHaveBeenCalledWith({
      commandId: "converter-cmd-1",
      clientSeq: 7,
      issuedAt: 1234,
      payloadJson: "{\"x\":24,\"y\":24,\"enabled\":true}",
      playerId: "player-1",
      sessionId: "session-1",
      type: "SET_CONVERTER_STRUCTURE_ENABLED"
    });
    expect(session.nextClientSeq).toBe(8);
  });
});
