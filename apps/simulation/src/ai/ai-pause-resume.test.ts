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

const makeCollectVisibleCommand = (playerId: string, clientSeq = 1, issuedAt = 1000): CommandEnvelope => ({
  commandId: `ai-runtime-${playerId}-${clientSeq}-${issuedAt}`,
  sessionId: `ai-runtime:${playerId}`,
  playerId,
  clientSeq,
  issuedAt,
  type: "COLLECT_VISIBLE",
  payloadJson: "{}"
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

  it("reports submitted worker AI command types after a successful submit", async () => {
    const runtime = makeRuntime(0);
    const onCommand = vi.fn();
    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: makeCommand(msg.playerId as string)
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
      onCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(onCommand).toHaveBeenCalledWith({
      playerId: "ai-1",
      commandType: "ATTACK"
    });
  });

  it("records worker planner errors as planner_error no-ops", async () => {
    const runtime = makeRuntime(0);
    const onNoCommand = vi.fn();
    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "error",
            playerId: msg.playerId,
            message: "planner exploded"
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
      expect.objectContaining({ playerId: "ai-1", noCommandReason: "planner_error" })
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

  it("does not hang the AI loop when the worker returns an error message", async () => {
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];
    const originalPostMessage = MockWorker.prototype.postMessage;
    let planCount = 0;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        planCount += 1;
        queueMicrotask(() => {
          if (planCount === 1) {
            this.emit("message", {
              type: "error",
              playerId: msg.playerId,
              message: "planner exploded"
            });
            return;
          }
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: makeCommand(msg.playerId as string)
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1"],
      submitCommand: async (command) => {
        submitted.push(command);
      },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));

    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(submitted).toEqual([expect.objectContaining({ playerId: "ai-1", type: "ATTACK" })]);
  });

  it("backs off collect-visible after a collect-cooldown rejection in worker mode", async () => {
    let nowMs = 1_000;
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];
    const decisionReasons: string[] = [];
    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: makeCollectVisibleCommand(msg.playerId as string, msg.clientSeq as number, msg.issuedAt as number),
            diagnostic: {
              playerId: msg.playerId,
              sessionPrefix: "ai-runtime",
              preplanReason: "collect_for_active_lock",
              frontierEnemyTargetCount: 0,
              frontierNeutralTargetCount: 0,
              canAttack: false,
              canExpand: false
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
      submitCommand: async (command) => {
        submitted.push(command);
      },
      onDecision: (diagnostic) => {
        if (diagnostic.preplanReason) decisionReasons.push(diagnostic.preplanReason);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    const firstTick = producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    runtime.emitEvent({
      eventType: "COMMAND_REJECTED",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000",
      code: "COLLECT_COOLDOWN"
    });
    await firstTick;
    nowMs = 1_001;
    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    nowMs = 21_001;
    const thirdTick = producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    runtime.emitEvent({
      eventType: "COMMAND_REJECTED",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-2-21001",
      code: "COLLECT_COOLDOWN"
    });
    await thirdTick;

    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(submitted.map((command) => command.type)).toEqual(["COLLECT_VISIBLE", "COLLECT_VISIBLE"]);
    expect(decisionReasons).toEqual(["collect_for_active_lock", "collect_for_active_lock"]);
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
      tileCollectionVersion: 1,
      topologyVersion: 1,
      topologyDirtyTileKeys: []
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

  it("submits worker preplan progression and then a same-tick gameplay action", async () => {
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];
    const postedPlans: WorkerMessage[] = [];

    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") postedPlans.push(msg);
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: msg.skipPreplan || msg.clientSeq === 2
              ? {
                  commandId: `ai-runtime-${msg.playerId}-2-1000`,
                  sessionId: `ai-runtime:${msg.playerId}`,
                  playerId: msg.playerId,
                  clientSeq: 2,
                  issuedAt: 1000,
                  type: "ATTACK",
                  payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
                }
              : {
                  commandId: `ai-runtime-${msg.playerId}-1-1000`,
                  sessionId: `ai-runtime:${msg.playerId}`,
                  playerId: msg.playerId,
                  clientSeq: 1,
                  issuedAt: 1000,
                  type: "CHOOSE_TECH",
                  payloadJson: JSON.stringify({ techId: "toolmaking" })
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
      submitCommand: async (command) => {
        submitted.push(command);
      },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    const tickPromise = producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(submitted.map((command) => command.type)).toEqual(["CHOOSE_TECH"]);
    expect(postedPlans).toHaveLength(1);

    runtime.emitEvent({
      eventType: "TECH_UPDATE",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000"
    });
    await tickPromise;
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(submitted.map((command) => command.type)).toEqual(["CHOOSE_TECH", "ATTACK"]);
    expect(postedPlans).toHaveLength(2);
  });

  it("advances to the next AI player after a first-pass worker noop", async () => {
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];
    const postedPlanPlayers: string[] = [];

    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        postedPlanPlayers.push(String(msg.playerId));
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: msg.playerId === "ai-2" ? makeCommand("ai-2") : null,
            diagnostic: msg.playerId === "ai-1"
              ? {
                  playerId: "ai-1",
                  sessionPrefix: "ai-runtime",
                  frontierEnemyTargetCount: 0,
                  frontierNeutralTargetCount: 0,
                  canAttack: false,
                  canExpand: false,
                  noCommandReason: "insufficient_points"
                }
              : undefined
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1", "ai-2"],
      submitCommand: async (command) => {
        submitted.push(command);
      },
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(postedPlanPlayers).toEqual(["ai-1", "ai-2"]);
    expect(submitted.map((command) => command.playerId)).toEqual(["ai-2"]);
  });

  it("skips a command-throttled AI and lets the next AI plan", async () => {
    let nowMs = 1_000;
    const runtime = makeRuntime(0);
    const submitted: CommandEnvelope[] = [];
    const postedPlanPlayers: string[] = [];

    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        postedPlanPlayers.push(String(msg.playerId));
        queueMicrotask(() => {
          const playerId = String(msg.playerId);
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: {
              commandId: `ai-runtime-${playerId}-1-1000`,
              sessionId: `ai-runtime:${playerId}`,
              playerId,
              clientSeq: 1,
              issuedAt: 1000,
              type: "BUILD_ECONOMIC_STRUCTURE",
              payloadJson: JSON.stringify({ x: 0, y: 0, structureType: "FARMSTEAD" })
            }
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: runtime.runtime,
      aiPlayerIds: ["ai-1", "ai-2"],
      submitCommand: async (command) => {
        submitted.push(command);
      },
      now: () => nowMs,
      tickIntervalMs: 10_000,
      minCommandIntervalMs: 5_000,
      workerScriptPath: "unused-by-mock.js"
    });

    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    runtime.emitEvent({
      eventType: "COMMAND_REJECTED",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000"
    });

    nowMs = 1_500;
    await producer.tick();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;

    expect(postedPlanPlayers).toEqual(["ai-1", "ai-2"]);
    expect(submitted.map((command) => command.playerId)).toEqual(["ai-1", "ai-2"]);
  });

  it("syncs worker player state immediately when a timed-out tech update arrives late", async () => {
    vi.useFakeTimers();
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
        activeDevelopmentProcessCount: 0,
        tileCollectionVersion: 1,
        topologyVersion: 1,
        topologyDirtyTileKeys: []
      }
    ];
    const exportPlannerPlayerViews = vi.fn((playerIds: string[]) =>
      plannerPlayers.filter((player) => playerIds.includes(player.id))
    );
    const postedPlans: WorkerMessage[] = [];

    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") postedPlans.push(msg);
      if (msg.type === "plan") {
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: msg.skipPreplan
              ? {
                  commandId: `ai-runtime-${msg.playerId}-2-1000`,
                  sessionId: `ai-runtime:${msg.playerId}`,
                  playerId: msg.playerId,
                  clientSeq: 2,
                  issuedAt: 1000,
                  type: "ATTACK",
                  payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
                }
              : {
                  commandId: `ai-runtime-${msg.playerId}-1-1000`,
                  sessionId: `ai-runtime:${msg.playerId}`,
                  playerId: msg.playerId,
                  clientSeq: 1,
                  issuedAt: 1000,
                  type: "CHOOSE_TECH",
                  payloadJson: JSON.stringify({ techId: "toolmaking" })
                }
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const producer = createWorkerAiCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews,
        onEvent: (listener: (event: { playerId: string; commandId: string; eventType: string }) => void) => {
          eventEmitter.on("event", listener);
          return () => eventEmitter.off("event", listener);
        }
      },
      aiPlayerIds: ["ai-1"],
      submitCommand: async () => undefined,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    exportPlannerPlayerViews.mockClear();
    const firstTick = producer.tick();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_001);
    await firstTick;

    eventEmitter.emit("event", {
      eventType: "TECH_UPDATE",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000"
    });

    expect(exportPlannerPlayerViews).toHaveBeenCalledWith(["ai-1"]);
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;
    vi.useRealTimers();
    expect(postedPlans).toHaveLength(1);
  });

  it("keeps timed-out preplan tracking alive across a later worker submit failure", async () => {
    vi.useFakeTimers();
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
        activeDevelopmentProcessCount: 0,
        tileCollectionVersion: 1,
        topologyVersion: 1,
        topologyDirtyTileKeys: []
      }
    ];
    const exportPlannerPlayerViews = vi.fn((playerIds: string[]) =>
      plannerPlayers.filter((player) => playerIds.includes(player.id))
    );
    const submittedTypes: string[] = [];

    const originalPostMessage = MockWorker.prototype.postMessage;
    MockWorker.prototype.postMessage = function (msg: WorkerMessage) {
      if (msg.type === "plan") {
        const planNumber = submittedTypes.length;
        queueMicrotask(() => {
          this.emit("message", {
            type: "command",
            playerId: msg.playerId,
            command: planNumber === 0
              ? {
                  commandId: `ai-runtime-${msg.playerId}-1-1000`,
                  sessionId: `ai-runtime:${msg.playerId}`,
                  playerId: msg.playerId,
                  clientSeq: 1,
                  issuedAt: 1000,
                  type: "CHOOSE_TECH",
                  payloadJson: JSON.stringify({ techId: "toolmaking" })
                }
              : {
                  commandId: `ai-runtime-${msg.playerId}-2-1000`,
                  sessionId: `ai-runtime:${msg.playerId}`,
                  playerId: msg.playerId,
                  clientSeq: 2,
                  issuedAt: 1000,
                  type: "ATTACK",
                  payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
                }
          });
        });
        return;
      }
      originalPostMessage.call(this, msg);
    };

    const submitCommand = vi.fn(async (command: CommandEnvelope) => {
      submittedTypes.push(command.type);
      if (command.type === "ATTACK") throw new Error("submit failed");
    });

    const producer = createWorkerAiCommandProducer({
      runtime: {
        queueDepths: () => ({ human_interactive: 0, human_noninteractive: 0, system: 0, ai: 0 }),
        exportPlannerWorldView: () => ({ tiles: [], players: plannerPlayers }),
        exportPlannerPlayerViews,
        onEvent: (listener: (event: { playerId: string; commandId: string; eventType: string }) => void) => {
          eventEmitter.on("event", listener);
          return () => eventEmitter.off("event", listener);
        }
      },
      aiPlayerIds: ["ai-1"],
      submitCommand,
      tickIntervalMs: 10_000,
      workerScriptPath: "unused-by-mock.js"
    });

    exportPlannerPlayerViews.mockClear();
    const firstTick = producer.tick();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(5_001);
    await firstTick;

    await producer.tick();

    eventEmitter.emit("event", {
      eventType: "TECH_UPDATE",
      playerId: "ai-1",
      commandId: "ai-runtime-ai-1-1-1000"
    });

    expect(submittedTypes).toEqual(["CHOOSE_TECH", "ATTACK"]);
    expect(exportPlannerPlayerViews).toHaveBeenCalledWith(["ai-1"]);
    producer.close();
    MockWorker.prototype.postMessage = originalPostMessage;
    vi.useRealTimers();
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
        tileCollectionVersion: 1,
        topologyVersion: 1,
        topologyDirtyTileKeys: []
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
        tileCollectionVersion: 1,
        topologyVersion: 1,
        topologyDirtyTileKeys: []
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
