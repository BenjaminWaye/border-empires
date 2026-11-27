/**
 * Planetary Defense camps are planned on the main thread
 * (runtime-barbarian-planner-bridge.ts), even in the worker-backed system
 * producer: nothing about the barbarian is synced to or planned in the worker,
 * settle events go straight to the bridge, and the barbarian is not held to
 * one command at a time (each camp has its own slot in the planner).
 */

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

type WorkerMessage = { type: string; [key: string]: unknown };

const mockState = vi.hoisted(() => ({ commandForPlan: undefined as ((seq: number) => unknown) | undefined, workers: [] as unknown[] }));

vi.mock("node:worker_threads", async () => {
  const { EventEmitter: Emitter } = await import("node:events");
  class MockWorker extends Emitter {
    readonly posted: WorkerMessage[] = [];
    constructor() {
      super();
      mockState.workers.push(this);
    }
    postMessage(msg: WorkerMessage): void {
      this.posted.push(msg);
      if (msg.type === "plan") {
        const command = mockState.commandForPlan?.(msg.clientSeq as number) ?? null;
        queueMicrotask(() => this.emit("message", { type: "command", playerId: msg.playerId, command }));
      }
    }
    terminate(): Promise<void> {
      return Promise.resolve();
    }
  }
  return { Worker: MockWorker };
});

const { createWorkerSystemCommandProducer } = await import("./system-command-producer-worker.js");

const makeRuntime = (commandForChoose: (seq: number) => CommandEnvelope | undefined) => {
  const events = new EventEmitter();
  const settled: Array<{ commandId: string; settledAt: number }> = [];
  const worldViewPlayerIds: string[][] = [];
  return {
    emit: (event: Record<string, unknown>) => events.emit("event", event),
    settled,
    worldViewPlayerIds,
    handle: {
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      exportPlannerWorldView: (playerIds: string[]) => {
        worldViewPlayerIds.push(playerIds);
        return { tiles: [], players: [] };
      },
      onEvent: (listener: (event: { playerId: string; eventType: string }) => void) => {
        events.on("event", listener);
        return () => events.off("event", listener);
      },
      exportPlannerPlayerViews: () => [],
      barbarianBridge: () => ({
        choose: (seq: number) => commandForChoose(seq),
        settle: (commandId: string, settledAt: number) => settled.push({ commandId, settledAt }),
        exportState: () => ({ camps: [] })
      })
    }
  };
};

const barbCommand = (seq: number, type: "ATTACK" | "EXPAND" = "ATTACK"): CommandEnvelope => ({
  commandId: `barb-cmd-${seq}`,
  sessionId: "system-runtime:barbarian-1",
  playerId: "barbarian-1",
  clientSeq: seq,
  issuedAt: 0,
  type,
  payloadJson: "{}"
});

const lastWorker = () => mockState.workers[mockState.workers.length - 1] as { posted: WorkerMessage[] };

describe("worker system command producer — Planetary Defense on the main thread", () => {
  it("never syncs the barbarian to the worker or asks the worker to plan it", async () => {
    const runtime = makeRuntime(() => undefined);
    const producer = createWorkerSystemCommandProducer({
      runtime: runtime.handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => 1_000_000
    });
    await producer.tick();
    expect(runtime.worldViewPlayerIds).toEqual([[]]);
    const types = lastWorker().posted.map((m) => m.type);
    expect(types).not.toContain("plan");
    expect(types).not.toContain("vision_union");
    expect(types).not.toContain("barb_settled");
    producer.close();
  });

  it("does not hold the barbarian to one command at a time, and relays settle events to the planner", async () => {
    let now = 1_000_000;
    const submitted: CommandEnvelope[] = [];
    const runtime = makeRuntime((seq) => barbCommand(seq));
    const producer = createWorkerSystemCommandProducer({
      runtime: runtime.handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async (c) => {
        submitted.push(c);
      },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => now
    });

    for (let i = 0; i < 3; i += 1) {
      await producer.tick();
      now += 500;
    }
    expect(submitted.map((c) => c.commandId)).toEqual(["barb-cmd-1", "barb-cmd-2", "barb-cmd-3"]);

    now += 30_000;
    runtime.emit({ eventType: "COMBAT_RESOLVED", playerId: "barbarian-1", commandId: "barb-cmd-1" });
    expect(runtime.settled).toEqual([{ commandId: "barb-cmd-1", settledAt: now }]);
    producer.close();
  });

  it("settles a barbarian command whose submission fails, so its camp is not held in flight", async () => {
    const runtime = makeRuntime((seq) => barbCommand(seq, "EXPAND"));
    const producer = createWorkerSystemCommandProducer({
      runtime: runtime.handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => {
        throw new Error("queue full");
      },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => 1_000_000
    });
    await producer.tick();
    expect(runtime.settled.map((entry) => entry.commandId)).toEqual(["barb-cmd-1"]);
    producer.close();
  });
});
