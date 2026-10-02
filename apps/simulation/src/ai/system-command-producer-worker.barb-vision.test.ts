/**
 * The system producer feeds the barbarian planner (in its worker) two things:
 *  - the set of barb tiles some player can currently see (`vision_union`), read
 *    from the real fog-of-war coverage at most once per interval and posted only
 *    when it changed; and
 *  - settle events (`barb_settled`) so each tile's rest starts when its action
 *    finishes.
 * It must NOT hold the barbarian to one command at a time: each barb tile is
 * limited by the planner, not by the producer's per-player gate.
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

const makeRuntime = (seenForCallIndex: (callIndex: number) => string[]) => {
  const events = new EventEmitter();
  let seenCalls = 0;
  return {
    emit: (event: Record<string, unknown>) => events.emit("event", event),
    seenCalls: () => seenCalls,
    handle: {
      queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
      exportPlannerWorldView: () => ({
        tiles: [],
        players: [
          {
            id: "barbarian-1",
            points: 500,
            manpower: 100,
            hasActiveLock: false,
            territoryTileKeys: [] as string[],
            frontierTileKeys: [] as string[],
            hotFrontierTileKeys: [] as string[],
            strategicFrontierTileKeys: [] as string[],
            buildCandidateTileKeys: [] as string[],
            pendingSettlementTileKeys: [] as string[],
            activeDevelopmentProcessCount: 0
          }
        ]
      }),
      onEvent: (listener: (event: { playerId: string; eventType: string }) => void) => {
        events.on("event", listener);
        return () => events.off("event", listener);
      },
      exportPlannerPlayerViews: () => [],
      exportBarbTilesSeenByAnyPlayer: () => seenForCallIndex(seenCalls++)
    }
  };
};

const lastWorker = () => mockState.workers[mockState.workers.length - 1] as { posted: WorkerMessage[] };
const visionPosts = () => lastWorker().posted.filter((m) => m.type === "vision_union");

describe("worker system command producer — barbarian vision", () => {
  it("recomputes the seen set at most once per interval", async () => {
    let now = 1_000_000;
    const runtime = makeRuntime((i) => [`seen-${i}`]);
    const producer = createWorkerSystemCommandProducer({
      runtime: runtime.handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => now,
      visionUnionMinRecomputeIntervalMs: 1000
    });

    await producer.tick();
    expect(runtime.seenCalls()).toBe(1);
    for (let i = 0; i < 3; i += 1) {
      now += 200;
      await producer.tick();
    }
    expect(runtime.seenCalls()).toBe(1);
    now += 1000;
    await producer.tick();
    expect(runtime.seenCalls()).toBe(2);
    producer.close();
  });

  it("posts vision_union only when the seen set actually changed", async () => {
    let now = 1_000_000;
    const sets = [["2,2", "1,1"], ["1,1", "2,2"], ["1,1", "2,2", "3,3"]];
    const runtime = makeRuntime((i) => [...(sets[i] ?? sets[2]!)]);
    const producer = createWorkerSystemCommandProducer({
      runtime: runtime.handle,
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js",
      now: () => now,
      visionUnionMinRecomputeIntervalMs: 1000
    });

    await producer.tick();
    expect(visionPosts()).toHaveLength(1);
    expect(visionPosts()[0]!.keys).toEqual(["1,1", "2,2"]);
    now += 1000;
    await producer.tick(); // same set, different order -> no post
    expect(visionPosts()).toHaveLength(1);
    now += 1000;
    await producer.tick();
    expect(visionPosts()).toHaveLength(2);
    expect(visionPosts()[1]!.keys).toEqual(["1,1", "2,2", "3,3"]);
    producer.close();
  });

  it("does not hold the barbarian to one command at a time, and relays settle events", async () => {
    let now = 1_000_000;
    mockState.commandForPlan = (seq) => ({
      commandId: `barb-cmd-${seq}`,
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: seq,
      issuedAt: 0,
      type: "ATTACK",
      payloadJson: "{}"
    });
    const submitted: CommandEnvelope[] = [];
    const runtime = makeRuntime(() => []);
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

    // Three ticks, no settle in between: the producer keeps issuing.
    for (let i = 0; i < 3; i += 1) {
      await producer.tick();
      now += 500;
    }
    expect(submitted.map((c) => c.commandId)).toEqual(["barb-cmd-1", "barb-cmd-2", "barb-cmd-3"]);

    // The first fight resolves -> the worker is told so the tile's rest starts now.
    now += 30_000;
    runtime.emit({ eventType: "COMBAT_RESOLVED", playerId: "barbarian-1", commandId: "barb-cmd-1" });
    const settled = lastWorker().posted.filter((m) => m.type === "barb_settled");
    expect(settled).toEqual([{ type: "barb_settled", commandId: "barb-cmd-1", settledAt: now }]);

    mockState.commandForPlan = undefined;
    producer.close();
  });

  it("settles a barbarian command whose submission fails, so its tile is not held in flight", async () => {
    mockState.commandForPlan = (seq) => ({
      commandId: `barb-cmd-${seq}`,
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: seq,
      issuedAt: 0,
      type: "EXPAND",
      payloadJson: "{}"
    });
    const runtime = makeRuntime(() => []);
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
    expect(lastWorker().posted.filter((m) => m.type === "barb_settled").map((m) => m.commandId)).toEqual(["barb-cmd-1"]);
    mockState.commandForPlan = undefined;
    producer.close();
  });
});
