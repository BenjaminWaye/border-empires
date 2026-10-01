import { describe, expect, it, vi } from "vitest";

import { createSystemCommandProducer } from "./system-command-producer.js";
import { SimulationRuntime } from "../runtime/runtime.js";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

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

  it("does not hold the barbarian to one command at a time and tells the planner when a command settles", async () => {
    const listeners: Array<(event: { playerId: string; eventType: string; commandId?: string }) => void> = [];
    const settled: Array<{ commandId: string; settledAt: number }> = [];
    let seq = 0;
    const barbCommand = (): CommandEnvelope => {
      seq += 1;
      return {
        commandId: `barb-${seq}`,
        sessionId: "system-runtime:barbarian-1",
        playerId: "barbarian-1",
        clientSeq: seq,
        issuedAt: 0,
        type: "EXPAND",
        payloadJson: "{}"
      };
    };
    const submitted: string[] = [];
    let nowMs = 5_000;
    const producer = createSystemCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        onEvent: (listener) => {
          listeners.push(listener as (typeof listeners)[number]);
          return () => undefined;
        },
        chooseNextOwnedFrontierCommand: () => undefined,
        chooseBarbarianCommand: () => barbCommand(),
        settleBarbarianCommand: (commandId, settledAt) => {
          settled.push({ commandId, settledAt });
        }
      },
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async (command) => {
        submitted.push(command.commandId);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000
    });

    await producer.tick();
    await producer.tick();
    expect(submitted).toEqual(["barb-1", "barb-2"]);

    nowMs = 35_000;
    for (const listener of listeners) listener({ playerId: "barbarian-1", eventType: "COMBAT_RESOLVED", commandId: "barb-1" });
    expect(settled).toEqual([{ commandId: "barb-1", settledAt: 35_000 }]);
    producer.close();
  });
});
