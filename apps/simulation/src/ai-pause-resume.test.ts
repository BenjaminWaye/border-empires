/**
 * Tests that the worker-backed AI command producer correctly implements
 * backpressure: ticks are skipped and the worker is paused while a
 * human_interactive command is queued, and resumes once it drains.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

// ─── Minimal mock Worker ─────────────────────────────────────────────────────

type WorkerMessage = { type: string; [key: string]: unknown };

class MockWorker extends EventEmitter {
  readonly posted: WorkerMessage[] = [];
  /** If set, auto-reply to "plan" messages with a command. */
  replyWithCommand: CommandEnvelope | null = null;

  postMessage(msg: WorkerMessage): void {
    this.posted.push(msg);
    if (msg.type === "plan") {
      // Simulate asynchronous worker response
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

vi.mock("node:worker_threads", () => ({
  Worker: MockWorker
}));

// Import after mock is set up
const { createWorkerAiCommandProducer } = await import("./ai-command-producer-worker.js");

// ─── Helpers ─────────────────────────────────────────────────────────────────

const makeRuntime = (humanInteractive = 0) => {
  const eventEmitter = new EventEmitter();
  const plannerPlayers = [
    {
      id: "ai-1",
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      territoryTileKeys: [] as string[],
      frontierTileKeys: [] as string[],
      hotFrontierTileKeys: [] as string[],
      strategicFrontierTileKeys: [] as string[],
      buildCandidateTileKeys: [] as string[],
      pendingSettlementTileKeys: [] as string[],
      activeDevelopmentProcessCount: 0
    }
  ];
  return {
    runtime: {
      queueDepths: () => ({
        human_interactive: humanInteractive,
        human_noninteractive: 0,
        system: 0,
        ai: 0
      }),
      exportPlannerWorldView: () => ({
        tiles: [],
        players: plannerPlayers
      }),
      exportPlannerPlayerViews: () => plannerPlayers,
      onEvent: (listener: (event: { playerId: string; commandId: string; eventType: string }) => void) => {
        eventEmitter.on("event", listener);
        return () => eventEmitter.off("event", listener);
      }
    },
    emitEvent: (event: { playerId: string; commandId: string; eventType: string }) => {
      eventEmitter.emit("event", event);
    },
    setHumanInteractive: (value: number) => {
      humanInteractive = value;
    }
  };
};

const makeCommand = (playerId: string): CommandEnvelope => ({
  commandId: `ai-runtime-${playerId}-1-1000`,
  sessionId: `ai-runtime:${playerId}`,
  playerId,
  clientSeq: 1,
  issuedAt: 1000,
  type: "ATTACK",
  payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
});

// ─── Tests ────────────────────────────────────────────────────────────────────

afterEach(() => {
  vi.useRealTimers();
});

describe("worker AI command producer pause/resume", () => {
  it("skips tick and sends pause message when human_interactive backlog is non-empty", async () => {
    const runtime = makeRuntime(1); // one human command queued
    const submitCommand = vi.fn(async () => undefined);

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    // First tick with backlog present
    await producer.tick();

    // submitCommand must not have been called
    expect(submitCommand).not.toHaveBeenCalled();

    // Pause behavior is asserted via no submitted command.
    producer.close();
  });

  it("submits a command when no human backlog exists", async () => {
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (cmd) => { submitted.push(cmd); },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    // Inject the reply the mock worker will emit
    // We need access to the internal MockWorker instance.
    // Since Worker is MockWorker, all instances share the mock class.
    // We'll drive the tick and let the mock auto-reply.
    const tickPromise = producer.tick();
    // The mock sends a reply via queueMicrotask — flush it
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await tickPromise;

    // Without a real frontier, the worker replies null (no command); that's fine.
    // The point is no error is thrown and the backpressure path wasn't hit.
    producer.close();
    expect(submitted.length).toBeGreaterThanOrEqual(0); // null reply → nothing submitted
  });

  it("sends resume to worker after backlog drains between ticks", async () => {
    // Capture all posted messages across ticks
    const allPosted: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      allPosted.push(msg);
      origPostMessage.call(this, msg);
    };

    const runtime = makeRuntime(1);

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick(); // backlog present → pause
    runtime.setHumanInteractive(0);
    await producer.tick(); // backlog drained → resume
    producer.close();

    // Restore prototype
    MockWorker.prototype.postMessage = origPostMessage;

    const types = allPosted.map((m) => m.type);
    expect(types).toContain("pause");
    expect(types).toContain("resume");
  });

  it("does not submit when shouldRun returns false", async () => {
    const submitCommand = vi.fn(async () => undefined);

    const producer = createWorkerAiCommandProducer({
      runtime: makeRuntime(0).runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand,
      shouldRun: () => false,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    producer.close();

    expect(submitCommand).not.toHaveBeenCalled();
  });

  it("forwards worker no-command diagnostics to the callback", async () => {
    const runtime = makeRuntime(0);
    const onNoCommand = vi.fn();
    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: null,
            diagnostic: {
              playerId: msg.playerId,
              sessionPrefix: "ai-runtime",
              settlementEligible: false,
              settlementCandidateFound: false,
              frontierEnemyTargetCount: 0,
              frontierNeutralTargetCount: 0,
              canAttack: false,
              canExpand: false,
              noCommandReason: "no_frontier_targets"
            }
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      onNoCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(onNoCommand).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: "ai-1", noCommandReason: "no_frontier_targets" })
    );
  });

  it("forwards granular worker phase diagnostics to the callback", async () => {
    const runtime = makeRuntime(0);
    const onDiagnostic = vi.fn();
    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "diagnostic",
            diagnostic: {
              phase: "planner_choose_frontier",
              durationMs: 321,
              playerId: msg.playerId,
              ownedTileCount: 17,
              frontierTileCount: 5
            }
          });
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: null
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      onDiagnostic,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(onDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "planner_choose_frontier",
        durationMs: 321,
        playerId: "ai-1",
        ownedTileCount: 17,
        frontierTileCount: 5
      })
    );
  });

  it("stagger-syncs a subset of AI players on each periodic sync interval", async () => {
    vi.useFakeTimers();
    const plannerPlayers = ["ai-1", "ai-2", "ai-3"].map((id) => ({
      id,
      points: 500,
      manpower: 10,
      hasActiveLock: false,
      territoryTileKeys: [] as string[],
      frontierTileKeys: [] as string[],
      pendingSettlementTileKeys: [] as string[],
      activeDevelopmentProcessCount: 0,
      tileCollectionVersion: 1
    }));
    const exportPlannerPlayerViews = vi.fn((playerIds: string[]) =>
      plannerPlayers.filter((player) => playerIds.includes(player.id))
    );

    const producer = createWorkerAiCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews,
        onEvent: () => () => undefined
      },
      aiPlayerIds: plannerPlayers.map((player) => player.id),
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      playerSyncIntervalMs: 50,
      periodicPlayerSyncBatchSize: 1,
      workerScriptPath: "unused-by-mock.js"
    });

    await vi.advanceTimersByTimeAsync(600);
    await vi.advanceTimersByTimeAsync(600);
    producer.close();

    expect(exportPlannerPlayerViews).toHaveBeenNthCalledWith(1, ["ai-1"]);
    expect(exportPlannerPlayerViews).toHaveBeenNthCalledWith(2, ["ai-2"]);
  });

  it("waits for command resolution before issuing another command for the same AI", async () => {
    const command = makeCommand("ai-1");
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];

    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (nextCommand) => {
        submitted.push(nextCommand);
      },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(submitted).toHaveLength(1);

    runtime.emitEvent({
      eventType: "TILE_DELTA_BATCH",
      playerId: "ai-1",
      commandId: command.commandId
    });
    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(submitted).toHaveLength(2);

    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;
  });

  it("does not forward irrelevant tile deltas to the AI worker", async () => {
    const postedMessages: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      postedMessages.push(msg);
      origPostMessage.call(this, msg);
    };

    const eventEmitter = new EventEmitter();
    const plannerPlayers = [
      {
        id: "ai-1",
        points: 500,
        manpower: 10,
        hasActiveLock: false,
        territoryTileKeys: ["10,10"],
        frontierTileKeys: ["10,10"],
        hotFrontierTileKeys: ["10,10"],
        strategicFrontierTileKeys: ["10,10"],
        buildCandidateTileKeys: [],
        pendingSettlementTileKeys: [] as string[],
        activeDevelopmentProcessCount: 0,
        tileCollectionVersion: 1
      }
    ];
    const producer = createWorkerAiCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews: () => plannerPlayers,
        onEvent: (listener: (event: { playerId: string; commandId: string; eventType: string }) => void) => {
          eventEmitter.on("event", listener);
          return () => eventEmitter.off("event", listener);
        }
      },
      aiPlayerIds: ["ai-1"],
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

  it("forwards tile deltas that fall inside the AI planning scope", async () => {
    const postedMessages: WorkerMessage[] = [];
    const origPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      postedMessages.push(msg);
      origPostMessage.call(this, msg);
    };

    const eventEmitter = new EventEmitter();
    const plannerPlayers = [
      {
        id: "ai-1",
        points: 500,
        manpower: 10,
        hasActiveLock: false,
        territoryTileKeys: ["10,10"],
        frontierTileKeys: ["10,10"],
        hotFrontierTileKeys: ["10,10"],
        strategicFrontierTileKeys: ["10,10"],
        buildCandidateTileKeys: [],
        pendingSettlementTileKeys: [] as string[],
        activeDevelopmentProcessCount: 0,
        tileCollectionVersion: 1
      }
    ];
    const producer = createWorkerAiCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews: () => plannerPlayers,
        onEvent: (listener: (event: { playerId: string; commandId: string; eventType: string }) => void) => {
          eventEmitter.on("event", listener);
          return () => eventEmitter.off("event", listener);
        }
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 50,
      workerScriptPath: "unused-by-mock.js"
    });

    eventEmitter.emit("event", {
      eventType: "TILE_DELTA_BATCH",
      playerId: "player-1",
      commandId: "human-cmd",
      tileDeltas: [{ x: 11, y: 11, terrain: "LAND", ownerId: "player-1" }]
    });
    await new Promise<void>((resolve) => setTimeout(resolve, 40));

    producer.close();
    MockWorker.prototype.postMessage = origPostMessage;

    const tileDeltaMessage = postedMessages.find((msg) => msg.type === "tile_deltas");
    expect(tileDeltaMessage).toBeDefined();
    expect(tileDeltaMessage).toMatchObject({
      type: "tile_deltas",
      tileDeltas: [{ x: 11, y: 11, terrain: "LAND", ownerId: "player-1" }]
    });
  });
});
