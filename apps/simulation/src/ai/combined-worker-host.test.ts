/**
 * Tests for the P3 thread-consolidation path: createCombinedWorkerHost
 * (combined-worker-host.ts) and its wiring into createWorkerAiCommandProducer
 * / createWorkerSystemCommandProducer via the `workerHost` option.
 *
 * The crux of P3 is "one Worker instead of two" — these tests pin that
 * property directly (constructor call count), plus channel-tagging,
 * message routing (no cross-talk between the ai/system channels), respawn
 * behavior, and that closing a producer does NOT tear down the shared
 * worker out from under the other producer.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

// ─── Minimal mock Worker ─────────────────────────────────────────────────────

type WorkerMessage = { type: string; [key: string]: unknown };

let constructedWorkers: MockWorker[] = [];

class MockWorker extends EventEmitter {
  readonly posted: WorkerMessage[] = [];
  terminated = false;

  constructor() {
    super();
    constructedWorkers.push(this);
  }

  postMessage(msg: WorkerMessage): void {
    this.posted.push(msg);
  }

  terminate(): Promise<void> {
    this.terminated = true;
    return Promise.resolve();
  }
}

vi.mock("node:worker_threads", () => ({
  Worker: MockWorker
}));

const { createCombinedWorkerHost } = await import("./combined-worker-host.js");
const { createWorkerAiCommandProducer } = await import("./ai-command-producer-worker.js");
const { createWorkerSystemCommandProducer } = await import("./system-command-producer-worker.js");

afterEach(() => {
  constructedWorkers = [];
  vi.useRealTimers();
});

const makeAiRuntime = () => ({
  queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
  exportPlannerWorldView: () => ({ tiles: [], players: [] }),
  exportPlannerPlayerViews: () => [],
  onEvent: () => () => undefined,
  exportTilesForKeys: () => []
});

const makeSystemRuntime = () => ({
  queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
  exportPlannerWorldView: () => ({ tiles: [], players: [] }),
  exportPlannerPlayerViews: () => [],
  onEvent: () => () => undefined,
  getBarbActivationVisionSignature: () => "sig-1",
  exportBarbActivationVisibleUnion: () => ({ keys: [], signature: "sig-1" })
});

describe("createCombinedWorkerHost", () => {
  it("spawns exactly one Worker for the whole host, regardless of how many channels are used", () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js" });
    host.channel("ai");
    host.channel("system");
    expect(constructedWorkers).toHaveLength(1);
    host.close();
  });

  it("tags outgoing messages with the channel name and keeps channels isolated", () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js" });
    const ai = host.channel("ai");
    const system = host.channel("system");
    ai.postMessage({ type: "plan", playerId: "ai-1" });
    system.postMessage({ type: "plan", playerId: "barbarian-1" });

    const worker = constructedWorkers[0]!;
    expect(worker.posted).toContainEqual({ type: "plan", playerId: "ai-1", channel: "ai" });
    expect(worker.posted).toContainEqual({ type: "plan", playerId: "barbarian-1", channel: "system" });

    const aiMessages: WorkerMessage[] = [];
    const systemMessages: WorkerMessage[] = [];
    ai.onMessage((msg) => aiMessages.push(msg));
    system.onMessage((msg) => systemMessages.push(msg));

    worker.emit("message", { type: "command", playerId: "ai-1", command: null, channel: "ai" });
    worker.emit("message", { type: "command", playerId: "barbarian-1", command: null, channel: "system" });

    expect(aiMessages).toEqual([{ type: "command", playerId: "ai-1", command: null }]);
    expect(systemMessages).toEqual([{ type: "command", playerId: "barbarian-1", command: null }]);
    host.close();
  });

  it("invokes onRespawn immediately for a listener registered after the worker is already live", () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js" });
    let calls = 0;
    host.channel("ai").onRespawn(() => { calls += 1; });
    expect(calls).toBe(1);
    host.close();
  });

  it("respawns a single fresh Worker on exit and notifies both channels", async () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js" });
    let aiRespawns = 0;
    let systemRespawns = 0;
    host.channel("ai").onRespawn(() => { aiRespawns += 1; });
    host.channel("system").onRespawn(() => { systemRespawns += 1; });
    expect(aiRespawns).toBe(1);
    expect(systemRespawns).toBe(1);

    const firstWorker = constructedWorkers[0]!;
    firstWorker.emit("exit", 1);
    // Respawn is scheduled via setTimeout(0) — let it fire.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    expect(constructedWorkers).toHaveLength(2);
    expect(aiRespawns).toBe(2);
    expect(systemRespawns).toBe(2);
    host.close();
  });

  it("retires the previous worker when an onRespawn listener throws, so a failed init can't orphan a live OS thread", async () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js", respawnRetryDelayMs: 1 });
    const firstWorker = constructedWorkers[0]!;

    // A producer whose (re)init throws — e.g. exportPlannerWorldView blowing
    // up under main-thread memory pressure. The host must retry, and in doing
    // so must NOT leave `firstWorker` running alongside its replacement:
    // two live threads is precisely the contention P3 removes.
    let shouldThrow = true;
    host.channel("ai").onRespawn(() => {
      if (shouldThrow) {
        shouldThrow = false;
        throw new Error("init blew up");
      }
    });

    expect(constructedWorkers).toHaveLength(1);
    expect(firstWorker.terminated).toBe(false);

    // Retry is scheduled on the (test-shortened) backoff timer.
    await vi.waitFor(() => {
      expect(constructedWorkers).toHaveLength(2);
    }, { timeout: 2_000, interval: 10 });

    expect(firstWorker.terminated).toBe(true);
    host.close();
  });

  it("does not terminate the shared worker on close for a producer using a channel — only host.close() does", () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js" });
    const worker = constructedWorkers[0]!;

    const aiProducer = createWorkerAiCommandProducer({
      runtime: makeAiRuntime(),
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerHost: host.channel("ai")
    });

    aiProducer.close();
    expect(worker.terminated).toBe(false);

    host.close();
    expect(worker.terminated).toBe(true);
  });
});

describe("createWorkerAiCommandProducer + createWorkerSystemCommandProducer sharing a combined host", () => {
  it("uses exactly one Worker for both producers and routes each producer's plan/command traffic without cross-talk", async () => {
    const host = createCombinedWorkerHost({ workerScriptPath: "unused-by-mock.js" });

    const aiSubmitted: CommandEnvelope[] = [];
    const aiProducer = createWorkerAiCommandProducer({
      runtime: makeAiRuntime(),
      aiPlayerIds: ["ai-1"],
      submitCommand: async (cmd) => { aiSubmitted.push(cmd); },
      tickIntervalMs: 10_000,
      workerHost: host.channel("ai")
    });

    const systemSubmitted: CommandEnvelope[] = [];
    const systemProducer = createWorkerSystemCommandProducer({
      runtime: makeSystemRuntime(),
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async (cmd) => { systemSubmitted.push(cmd); },
      tickIntervalMs: 10_000,
      workerHost: host.channel("system")
    });

    // Exactly one OS-thread-worthy Worker was constructed for both producers —
    // this is the entire point of P3.
    expect(constructedWorkers).toHaveLength(1);
    const worker = constructedWorkers[0]!;

    const aiPlan = worker.posted.find((m) => m.channel === "ai" && m.type === "init");
    const systemPlan = worker.posted.find((m) => m.channel === "system" && m.type === "init");
    expect(aiPlan).toBeDefined();
    expect(systemPlan).toBeDefined();

    // Drive one tick for each; each should only post a "plan" tagged for its
    // own channel, and only resolve against a reply tagged for that channel.
    const aiTick = aiProducer.tick();
    const systemTick = systemProducer.tick();

    const aiPlanMsg = worker.posted.find((m) => m.channel === "ai" && m.type === "plan");
    const systemPlanMsg = worker.posted.find((m) => m.channel === "system" && m.type === "plan");
    expect(aiPlanMsg).toBeDefined();
    expect(systemPlanMsg).toBeDefined();

    const aiCommand: CommandEnvelope = {
      commandId: "ai-runtime-ai-1-1-1000",
      sessionId: "ai-runtime:ai-1",
      playerId: "ai-1",
      clientSeq: 1,
      issuedAt: 1000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    };
    const systemCommand: CommandEnvelope = {
      commandId: "system-runtime-barbarian-1-1-1000",
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: 1,
      issuedAt: 1000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    };

    // Reply to the SYSTEM plan first, tagged for the "system" channel — this
    // must resolve only the system producer's pending request, not the AI one.
    worker.emit("message", { type: "command", playerId: "barbarian-1", command: systemCommand, channel: "system" });
    worker.emit("message", { type: "command", playerId: "ai-1", command: aiCommand, channel: "ai" });

    await aiTick;
    await systemTick;

    expect(aiSubmitted.map((c) => c.playerId)).toEqual(["ai-1"]);
    expect(systemSubmitted.map((c) => c.playerId)).toEqual(["barbarian-1"]);

    aiProducer.close();
    systemProducer.close();
    expect(worker.terminated).toBe(false); // released by both producers, but host still owns it
    host.close();
    expect(worker.terminated).toBe(true);
  });
});
