import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@border-empires/shared";
import { createAiScheduler } from "./scheduler.js";

const makeAiPlayer = (id: string): Player =>
  ({
    id,
    name: id,
    x: 0,
    y: 0,
    color: "#fff",
    points: 0,
    level: 1,
    T: 1,
    stamina: 0,
    territoryTiles: new Set<string>(),
    discoveredContinents: [],
    isAi: true,
    isEliminated: false,
    respawnPending: false,
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techIds: new Set<string>(),
    unlockedTechIds: [],
    currentResearch: undefined,
    researchQueue: [],
    domainIds: new Set<string>(),
    claimedDomains: [],
    missions: [],
    missionStats: {
      neutralCaptures: 0,
      enemyCaptures: 0,
      combatWins: 0,
      maxTilesHeld: 0,
      maxSettledTilesHeld: 0,
      maxFarmsHeld: 0,
      maxContinentsHeld: 0,
      maxTechPicks: 0
    },
    pendingTargetBoosts: 0,
    powerups: [],
    E: 0,
    Ts: 0,
    Es: 0,
    currentTargetBoost: undefined,
    techPoints: 0,
    currentTownFocus: undefined,
    currentDomainFocus: undefined,
    inventory: [],
    alliances: new Set<string>(),
    allies: new Set<string>()
  } as unknown) as Player;

describe("createAiScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("skips dispatch while a human chunk snapshot is active", () => {
    const enqueued: Array<{ actor: Player }> = [];
    const scheduler = createAiScheduler<Player, { playerId: string }, { score: number }, { cycleId: number }>({
      config: {
        tickMs: 10_000,
        dispatchIntervalMs: 250,
        tickBatchSize: 2,
        humanPriorityBatchSize: 1,
        humanDefenseBatchSize: 2,
        authPriorityBatchSize: 1,
        defensePriorityMs: 15_000,
        workerQueueSoftLimit: 4,
        simulationQueueSoftLimit: 6,
        eventLoopP95SoftLimitMs: 60,
        eventLoopUtilizationSoftLimitPct: 65
      },
      now: () => 1_000,
      getAllPlayers: () => [makeAiPlayer("ai-1"), makeAiPlayer("ai-2")],
      onlineHumanPlayerCount: () => 1,
      latestRuntimeVitalsSample: () => undefined,
      pendingAuthVerifications: () => 0,
      authPriorityUntil: () => 0,
      aiQueueDepth: () => 0,
      simulationQueueDepth: () => 0,
      humanChunkSnapshotPriorityActive: () => true,
      getAiCompetitionContext: () => ({
        competitionMetrics: [],
        incomeByPlayerId: new Map(),
        townsTarget: 0,
        settledTilesTarget: 0,
        analysisByPlayerId: new Map()
      }),
      createTickContext: (cycleId) => ({ cycleId }),
      enqueueAiWorkerJob: (job) => {
        enqueued.push({ actor: job.actor });
      },
      runtimeMemoryStats: () => ({ rssMb: 0, heapUsedMb: 0, heapTotalMb: 0, externalMb: 0, arrayBuffersMb: 0 }),
      pushAiTickPerf: () => undefined,
      onSlowAiTick: () => undefined
    });

    scheduler.runAiTick();

    expect(enqueued).toHaveLength(0);
    expect(scheduler.state.reason).toBe("human_chunk_snapshot_priority");
    expect(scheduler.state.batchSize).toBe(0);
  });

  it("enqueues due AI turns in bounded slices", async () => {
    vi.useFakeTimers();
    const enqueued: Array<{ actor: Player; tickContext: { cycleId: number } }> = [];
    let nowMs = 1_000;
    const players = [makeAiPlayer("ai-1"), makeAiPlayer("ai-2")];
    const scheduler = createAiScheduler<Player, { playerId: string }, { score: number }, { cycleId: number }>({
      config: {
        tickMs: 10_000,
        dispatchIntervalMs: 250,
        tickBatchSize: 2,
        humanPriorityBatchSize: 1,
        humanDefenseBatchSize: 2,
        authPriorityBatchSize: 1,
        defensePriorityMs: 15_000,
        workerQueueSoftLimit: 4,
        simulationQueueSoftLimit: 6,
        eventLoopP95SoftLimitMs: 60,
        eventLoopUtilizationSoftLimitPct: 65
      },
      now: () => nowMs,
      getAllPlayers: () => players,
      onlineHumanPlayerCount: () => 0,
      latestRuntimeVitalsSample: () => undefined,
      pendingAuthVerifications: () => 0,
      authPriorityUntil: () => 0,
      aiQueueDepth: () => 0,
      simulationQueueDepth: () => 0,
      humanChunkSnapshotPriorityActive: () => false,
      getAiCompetitionContext: () => ({
        competitionMetrics: [],
        incomeByPlayerId: new Map(),
        townsTarget: 0,
        settledTilesTarget: 0,
        analysisByPlayerId: new Map()
      }),
      createTickContext: (cycleId) => ({ cycleId }),
      enqueueAiWorkerJob: (job) => {
        enqueued.push({ actor: job.actor, tickContext: job.tickContext });
        nowMs += 5;
        job.onComplete(5);
      },
      runtimeMemoryStats: () => ({ rssMb: 1, heapUsedMb: 1, heapTotalMb: 1, externalMb: 0, arrayBuffersMb: 0 }),
      pushAiTickPerf: () => undefined,
      onSlowAiTick: () => undefined
    });

    scheduler.runAiTick();
    await vi.runAllTimersAsync();

    expect(enqueued.map((job) => job.actor.id)).toEqual(["ai-1"]);
    expect(enqueued[0]?.tickContext.cycleId).toBe(1);
    expect(scheduler.state.selectedAiPlayers).toBe(1);
  });

  it("still meets cadence for larger AI counts with the minimum required batch size", async () => {
    vi.useFakeTimers();
    let nowMs = 1_000;
    const enqueued: string[] = [];
    const players = Array.from({ length: 40 }, (_, index) => makeAiPlayer(`ai-${index + 1}`));
    const scheduler = createAiScheduler<Player, { playerId: string }, { score: number }, { cycleId: number }>({
      config: {
        tickMs: 10_000,
        dispatchIntervalMs: 250,
        tickBatchSize: 2,
        humanPriorityBatchSize: 1,
        humanDefenseBatchSize: 2,
        authPriorityBatchSize: 1,
        defensePriorityMs: 15_000,
        workerQueueSoftLimit: 4,
        simulationQueueSoftLimit: 6,
        eventLoopP95SoftLimitMs: 60,
        eventLoopUtilizationSoftLimitPct: 65
      },
      now: () => nowMs,
      getAllPlayers: () => players,
      onlineHumanPlayerCount: () => 0,
      latestRuntimeVitalsSample: () => undefined,
      pendingAuthVerifications: () => 0,
      authPriorityUntil: () => 0,
      aiQueueDepth: () => 0,
      simulationQueueDepth: () => 0,
      humanChunkSnapshotPriorityActive: () => false,
      getAiCompetitionContext: () => ({
        competitionMetrics: [],
        incomeByPlayerId: new Map(),
        townsTarget: 0,
        settledTilesTarget: 0,
        analysisByPlayerId: new Map()
      }),
      createTickContext: (cycleId) => ({ cycleId }),
      enqueueAiWorkerJob: (job) => {
        enqueued.push(job.actor.id);
        job.onComplete(5);
      },
      runtimeMemoryStats: () => ({ rssMb: 1, heapUsedMb: 1, heapTotalMb: 1, externalMb: 0, arrayBuffersMb: 0 }),
      pushAiTickPerf: () => undefined,
      onSlowAiTick: () => undefined
    });

    for (let tick = 0; tick < 40; tick += 1) {
      scheduler.runAiTick();
      nowMs += 250;
      await vi.runAllTimersAsync();
    }

    expect(new Set(enqueued).size).toBe(40);
    expect(scheduler.state.batchSize).toBe(1);
  });
});
