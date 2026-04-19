import { describe, expect, it, vi } from "vitest";

import { createAiCommandProducer } from "./ai-command-producer.js";
import { SimulationRuntime } from "./runtime.js";

describe("ai command producer", () => {
  it("submits AI frontier commands through the same durable envelope path", async () => {
    const runtime = new SimulationRuntime({ seedProfile: "stress-10ai" });
    const submitted: Array<{ playerId: string; type: string; payloadJson: string; clientSeq: number }> = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submitted.push({
          playerId: command.playerId,
          type: command.type,
          payloadJson: command.payloadJson,
          clientSeq: command.clientSeq
        });
      },
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      playerId: "ai-1",
      type: "ATTACK",
      clientSeq: 1
    });
    expect(JSON.parse(submitted[0]!.payloadJson)).toEqual(
      expect.objectContaining({
        fromX: expect.any(Number),
        fromY: expect.any(Number),
        toX: expect.any(Number),
        toY: expect.any(Number)
      })
    );
  });

  it("pauses AI submissions while human interactive backlog exists", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      }
    });
    runtime.submitCommand({
      commandId: "human-cmd",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    const submitCommand = vi.fn(async () => undefined);
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    expect(submitCommand).not.toHaveBeenCalled();

    for (const task of scheduled) task();
    await Promise.resolve();
    await producer.tick();
    producer.close();

    expect(submitCommand).toHaveBeenCalledTimes(1);
  });

  it("rotates across AI players instead of always retrying the first player", async () => {
    const onEvent = vi.fn(() => () => undefined);
    const chooseNextAutomationCommand = vi.fn(
      (playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })
    );
    const runtime = {
      chooseNextAutomationCommand,
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent
    };
    const submittedPlayers: string[] = [];
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1", "ai-2", "ai-3"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => 1_000,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-1", commandId: "ai-runtime-ai-1-1-1000" });
    await producer.tick();
    runtime.onEvent.mock.calls[0]?.[0]?.({ eventType: "COMMAND_REJECTED", playerId: "ai-2", commandId: "ai-runtime-ai-2-1-1000" });
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-2", "ai-3"]);
  });

  it("does not submit while the producer is externally paused", async () => {
    const submitCommand = vi.fn(async () => undefined);
    const producer = createAiCommandProducer({
      runtime: {
        chooseNextAutomationCommand: vi.fn(() => ({
          commandId: "ai-runtime-ai-1-1-1000",
          sessionId: "ai-runtime:ai-1",
          playerId: "ai-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "EXPAND",
          payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
        })),
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      aiPlayerIds: ["ai-1"],
      shouldRun: () => false,
      submitCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("releases stale pending AI commands so one stuck player does not freeze forever", async () => {
    let nowMs = 1_000;
    const submittedPlayers: string[] = [];
    const runtime = {
      chooseNextAutomationCommand: vi.fn((playerId: string, clientSeq: number, issuedAt: number) => ({
        commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
        sessionId: `ai-runtime:${playerId}`,
        playerId,
        clientSeq,
        issuedAt,
        type: "EXPAND" as const,
        payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
      })),
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      onEvent: () => () => undefined
    };
    const producer = createAiCommandProducer({
      runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submittedPlayers.push(command.playerId);
      },
      now: () => nowMs,
      pendingCommandTimeoutMs: 100,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    nowMs = 1_150;
    await producer.tick();
    producer.close();

    expect(submittedPlayers).toEqual(["ai-1", "ai-1"]);
  });
});
