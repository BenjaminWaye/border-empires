/**
 * Tests for the system job worker producer.
 *
 * Verifies that:
 *  - Barbarian / system planning is dispatched via a Worker thread
 *  - The producer skips ticks when ANY queue has a backlog
 *    (stricter than AI producer, which only blocks on human_interactive)
 *  - The worker receives "shutdown" on close
 */

import { describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

// ─── Minimal mock Worker ──────────────────────────────────────────────────────

type WorkerMessage = { type: string; [key: string]: unknown };

class MockWorker extends EventEmitter {
  readonly posted: WorkerMessage[] = [];
  replyWithCommand: CommandEnvelope | null = null;

  postMessage(msg: WorkerMessage): void {
    this.posted.push(msg);
    if (msg.type === "plan") {
      const reply = {
        type: "command",
        playerId: msg.playerId,
        command: this.replyWithCommand
      };
      queueMicrotask(() => this.emit("message", reply));
    }
  }

  terminate(): Promise<void> {
    return Promise.resolve();
  }
}

vi.mock("node:worker_threads", () => ({ Worker: MockWorker }));

const { createWorkerSystemCommandProducer } = await import("./system-command-producer-worker.js");

// ─── Helpers ──────────────────────────────────────────────────────────────────

const makeRuntime = (depths: {
  human_interactive?: number;
  human_noninteractive?: number;
  system?: number;
  ai?: number;
} = {}) => {
  const eventEmitter = new EventEmitter();
  return {
    queueDepths: () => ({
      human_interactive: depths.human_interactive ?? 0,
      human_noninteractive: depths.human_noninteractive ?? 0,
      system: depths.system ?? 0,
      ai: depths.ai ?? 0
    }),
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
      eventEmitter.on("event", listener);
      return () => eventEmitter.off("event", listener);
    }
  };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("worker system command producer backpressure", () => {
  it("skips tick when human_interactive backlog is non-empty", async () => {
    const submitCommand = vi.fn(async () => undefined);

    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime({ human_interactive: 1 }),
      systemPlayerIds: ["barbarian-1"],
      submitCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("skips tick when human_noninteractive backlog is non-empty", async () => {
    const submitCommand = vi.fn(async () => undefined);

    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime({ human_noninteractive: 3 }),
      systemPlayerIds: ["barbarian-1"],
      submitCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("skips tick when system queue backlog is non-empty", async () => {
    const submitCommand = vi.fn(async () => undefined);

    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime({ system: 2 }),
      systemPlayerIds: ["barbarian-1"],
      submitCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("does not submit when shouldRun returns false", async () => {
    const submitCommand = vi.fn(async () => undefined);

    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime(),
      systemPlayerIds: ["barbarian-1"],
      submitCommand,
      shouldRun: () => false,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("sends plan message to worker when no backlog", async () => {
    // Capture messages posted to the mock worker
    const postedMessages: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      postedMessages.push(msg);
      origPostMessage.call(this, msg);
    };

    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime(),
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    // Drive the tick; worker replies with null (no frontier) via MockWorker
    const tickPromise = producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await tickPromise;
    producer.close();

    MockWorker.prototype.postMessage = origPostMessage;

    const planMessages = postedMessages.filter((m) => m.type === "plan");
    expect(planMessages.length).toBeGreaterThanOrEqual(1);
    expect(planMessages[0]).toMatchObject({
      type: "plan",
      playerId: "barbarian-1",
      sessionPrefix: "system-runtime"
    });
  });

  it("sends shutdown to worker on close", async () => {
    const postedMessages: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      postedMessages.push(msg);
      origPostMessage.call(this, msg);
    };

    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime(),
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    expect(postedMessages.some((m) => m.type === "shutdown")).toBe(true);
  });

  it("submits a command returned by the worker", async () => {
    const fakeCommand: CommandEnvelope = {
      commandId: "system-runtime-barbarian-1-1-1000",
      sessionId: "system-runtime:barbarian-1",
      playerId: "barbarian-1",
      clientSeq: 1,
      issuedAt: 1000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 5, fromY: 0, toX: 4, toY: 0 })
    };

    // Make the MockWorker auto-reply with this command
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() =>
          this.emit("message", { type: "command", playerId: msg.playerId, command: fakeCommand })
        );
      } else {
        origPostMessage.call(this, msg);
      }
    };

    const submitted: CommandEnvelope[] = [];
    const producer = createWorkerSystemCommandProducer({
      runtime: makeRuntime(),
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async (cmd) => { submitted.push(cmd); },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    const tickPromise = producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 10));
    await tickPromise;
    producer.close();

    MockWorker.prototype.postMessage = origPostMessage;

    expect(submitted).toHaveLength(1);
    expect(submitted[0]).toMatchObject({
      playerId: "barbarian-1",
      type: "ATTACK",
      sessionId: "system-runtime:barbarian-1"
    });
  });

  it("does not forward irrelevant tile deltas to the system worker", async () => {
    const postedMessages: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      postedMessages.push(msg);
      origPostMessage.call(this, msg);
    };

    const eventEmitter = new EventEmitter();
    const plannerPlayers = [
      {
        id: "barbarian-1",
        points: 500,
        manpower: 100,
        hasActiveLock: false,
        territoryTileKeys: ["25,0"],
        frontierTileKeys: ["25,0"],
        hotFrontierTileKeys: ["25,0"],
        strategicFrontierTileKeys: ["25,0"],
        buildCandidateTileKeys: [],
        pendingSettlementTileKeys: [] as string[],
        activeDevelopmentProcessCount: 0,
        tileCollectionVersion: 1
      }
    ];
    const producer = createWorkerSystemCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews: () => plannerPlayers,
        onEvent: (listener: (event: { playerId: string; eventType: string }) => void) => {
          eventEmitter.on("event", listener);
          return () => eventEmitter.off("event", listener);
        }
      },
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 50,
      workerScriptPath: "unused-by-mock.js"
    });

    eventEmitter.emit("event", {
      eventType: "TILE_DELTA_BATCH",
      playerId: "player-1",
      commandId: "human-cmd",
      tileDeltas: [{ x: 100, y: 100, terrain: "LAND", ownerId: "player-1" }]
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    expect(postedMessages.some((msg) => msg.type === "tile_deltas")).toBe(false);
  });

  it("forwards tile deltas that fall inside the system planning scope", async () => {
    const postedMessages: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      postedMessages.push(msg);
      origPostMessage.call(this, msg);
    };

    const eventEmitter = new EventEmitter();
    const plannerPlayers = [
      {
        id: "barbarian-1",
        points: 500,
        manpower: 100,
        hasActiveLock: false,
        territoryTileKeys: ["25,0"],
        frontierTileKeys: ["25,0"],
        hotFrontierTileKeys: ["25,0"],
        strategicFrontierTileKeys: ["25,0"],
        buildCandidateTileKeys: [],
        pendingSettlementTileKeys: [] as string[],
        activeDevelopmentProcessCount: 0,
        tileCollectionVersion: 1
      }
    ];
    const producer = createWorkerSystemCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews: () => plannerPlayers,
        onEvent: (listener: (event: { playerId: string; eventType: string }) => void) => {
          eventEmitter.on("event", listener);
          return () => eventEmitter.off("event", listener);
        }
      },
      systemPlayerIds: ["barbarian-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 50,
      workerScriptPath: "unused-by-mock.js"
    });

    eventEmitter.emit("event", {
      eventType: "TILE_DELTA_BATCH",
      playerId: "player-1",
      commandId: "human-cmd",
      tileDeltas: [{ x: 24, y: 0, terrain: "LAND", ownerId: "player-1" }]
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    const tileDeltaMessage = postedMessages.find((msg) => msg.type === "tile_deltas");
    expect(tileDeltaMessage).toBeDefined();
    expect(tileDeltaMessage).toMatchObject({
      type: "tile_deltas",
      tileDeltas: [{ x: 24, y: 0, terrain: "LAND", ownerId: "player-1" }]
    });
  });
});
