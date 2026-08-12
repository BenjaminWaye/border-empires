import { describe, expect, it, vi } from "vitest";

import { InMemoryGatewayCommandStore } from "../command-store/command-store.js";
import { submitDurableCommand, submitFrontierCommand } from "./frontier-submit.js";

describe("submitFrontierCommand", () => {
  it("sends queued and forwards the durable envelope to simulation", async () => {
    const payloads: unknown[] = [];
    const submitCommand = vi.fn<Parameters<typeof submitFrontierCommand>[2]["submitCommand"]>().mockResolvedValue();
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1, nextServerAssignedClientSeq: -1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11, clientSeq: 1 },
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
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1, nextServerAssignedClientSeq: -1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11, clientSeq: 1 },
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

  it("returns SEASON_ENDED when simulation rejects commands after a season freeze", async () => {
    const payloads: unknown[] = [];
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1, nextServerAssignedClientSeq: -1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11, clientSeq: 1 },
      {
        createCommandId: () => "cmd-1",
        now: () => 1234,
        commandStore: new InMemoryGatewayCommandStore(),
        submitCommand: async () => {
          throw new Error("season ended");
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
        code: "SEASON_ENDED",
        message: "season has ended; wait for the next world to begin"
      }
    ]);
  });

  it("does not claim a command was queued if gateway persistence fails first", async () => {
    const payloads: unknown[] = [];
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1, nextServerAssignedClientSeq: -1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11, clientSeq: 1 },
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

  it("calls onError and still sends rejection when markRejected throws", async () => {
    const payloads: unknown[] = [];
    const errors: Array<{ phase: string; err: unknown }> = [];
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1, nextServerAssignedClientSeq: -1 };

    await submitFrontierCommand(
      session,
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11 },
      {
        createCommandId: () => "cmd-1",
        now: () => 1234,
        commandStore: {
          async persistQueuedCommand(cmd) {
            return {
              commandId: cmd.commandId,
              sessionId: cmd.sessionId,
              playerId: cmd.playerId,
              clientSeq: cmd.clientSeq,
              type: cmd.type,
              payloadJson: cmd.payloadJson,
              queuedAt: 1234,
              status: "QUEUED" as const
            };
          },
          async markAccepted() {},
          async markRejected() {
            throw new Error("sqlite locked");
          },
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
        submitCommand: async () => {
          throw new Error("simulation unavailable");
        },
        onError: (phase, err) => {
          errors.push({ phase, err });
        },
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.phase).toBe("mark_rejected");
    expect(payloads).toContainEqual({
      type: "ERROR",
      commandId: "cmd-1",
      code: "SIMULATION_UNAVAILABLE",
      message: "command could not be queued in simulation"
    });
  });

  it("calls onError when sendJson throws on the rejection response", async () => {
    const errors: Array<{ phase: string; err: unknown }> = [];
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 1, nextServerAssignedClientSeq: -1 };
    let sendCount = 0;

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
        onError: (phase, err) => {
          errors.push({ phase, err });
        },
        sendJson: () => {
          sendCount++;
          if (sendCount === 2) throw new Error("socket closed");
        }
      }
    );

    expect(errors).toHaveLength(1);
    expect(errors[0]?.phase).toBe("send_rejection");
  });

  it("reuses the existing queued command when the client resubmits the same clientSeq (reconnect resend)", async () => {
    // The client is the one who supplies clientSeq here (mirroring a real
    // EXPAND/ATTACK resend after a reconnect gap, possibly with a fresh
    // commandId but the same clientSeq it originally tracked) -- this is the
    // legitimate case persistQueuedCommand's UNIQUE-constraint dedup exists
    // for. Contrast with the gateway's own *fallback* clientSeq assignment
    // (used for commands like WAYPOINT_ENQUEUE that never carry a client
    // clientSeq), which now comes from a disjoint counter specifically so it
    // can never collide with -- and get deduped against -- an unrelated
    // command like this one.
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
      { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4, nextServerAssignedClientSeq: -1 },
      { type: "ATTACK", fromX: 10, fromY: 10, toX: 10, toY: 11, clientSeq: 4 },
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

  it("never collides a gateway-assigned fallback clientSeq with an existing client-tracked one", async () => {
    // Regression test for the bug this fix addresses: a command with no
    // client-supplied clientSeq (e.g. WAYPOINT_ENQUEUE) used to fall back to
    // session.nextClientSeq -- the same counter space the client mints its
    // own clientSeq values into for ATTACK/EXPAND. If those raced, the
    // fallback could land on a seq the client had already claimed, and
    // persistQueuedCommand's dedup would then silently swallow the *real*
    // command as if it were a duplicate of the unrelated one. The fallback
    // now comes from a disjoint negative counter, so this can't happen.
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
    const submitted: unknown[] = [];

    await submitDurableCommand(
      { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4, nextServerAssignedClientSeq: -1 },
      { type: "WAYPOINT_ENQUEUE", payload: { x: 5, y: 5 } },
      {
        createCommandId: () => "cmd-new",
        now: () => 1234,
        commandStore,
        submitCommand: async (command) => {
          submitted.push(command);
        },
        sendJson: (payload) => {
          payloads.push(payload);
        }
      }
    );

    expect(payloads).toEqual([{ type: "COMMAND_QUEUED", commandId: "cmd-new", clientSeq: -2 }]);
    expect(submitted).toHaveLength(1);
  });

  it("uses the client-provided command identity when present", async () => {
    const payloads: unknown[] = [];
    const submitCommand = vi.fn<Parameters<typeof submitFrontierCommand>[2]["submitCommand"]>().mockResolvedValue();
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4, nextServerAssignedClientSeq: -1 };

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
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 4, nextServerAssignedClientSeq: -1 };

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
    const session = { sessionId: "session-1", playerId: "player-1", nextClientSeq: 7, nextServerAssignedClientSeq: -1 };

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
