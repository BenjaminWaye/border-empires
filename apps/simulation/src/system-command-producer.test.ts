import { describe, expect, it, vi } from "vitest";

import { createSystemCommandProducer } from "./system-command-producer.js";
import { SimulationRuntime } from "./runtime.js";

describe("system command producer", () => {
  it("submits system frontier commands through the durable system lane", async () => {
    const runtime = new SimulationRuntime({ seedProfile: "stress-10ai" });
    const submitted: Array<{ playerId: string; type: string; payloadJson: string; sessionId: string }> = [];
    const producer = createSystemCommandProducer({
      runtime,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async (command) => {
        submitted.push({
          playerId: command.playerId,
          type: command.type,
          payloadJson: command.payloadJson,
          sessionId: command.sessionId
        });
      },
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(submitted).toEqual([
      {
        playerId: "barbarian-1",
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 25, fromY: 0, toX: 24, toY: 0 }),
        sessionId: "system-runtime:barbarian-1"
      }
    ]);
  });

  it("pauses system submissions while human interactive backlog exists", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      now: () => 1_000
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
    const producer = createSystemCommandProducer({
      runtime,
      systemPlayerIds: ["barbarian-1"],
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

  it("does not submit while the producer is externally paused", async () => {
    const submitCommand = vi.fn(async () => undefined);
    const producer = createSystemCommandProducer({
      runtime: {
        chooseNextOwnedFrontierCommand: vi.fn(() => ({
          commandId: "system-runtime-barbarian-1-1-1000",
          sessionId: "system-runtime:barbarian-1",
          playerId: "barbarian-1",
          clientSeq: 1,
          issuedAt: 1_000,
          type: "ATTACK",
          payloadJson: JSON.stringify({ fromX: 25, fromY: 0, toX: 24, toY: 0 })
        })),
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: () => () => undefined
      },
      systemPlayerIds: ["barbarian-1"],
      shouldRun: () => false,
      submitCommand,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });
});
