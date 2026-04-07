import { describe, expect, it, vi } from "vitest";

import { createAiRuntime } from "./ai-runtime.js";

describe("createAiRuntime", () => {
  it("reuses competition context within ttl and rebuilds it after expiry", () => {
    let nowMs = 1_000;
    const collectCompetitionMetrics = vi.fn(() => [
      {
        playerId: "ai-1",
        incomePerMinute: 12
      }
    ]);
    const runtime = createAiRuntime({
      config: {
        tickMs: 10_000,
        dispatchIntervalMs: 250,
        tickBatchSize: 1,
        humanPriorityBatchSize: 1,
        humanDefenseBatchSize: 1,
        authPriorityBatchSize: 1,
        defensePriorityMs: 5_000,
        workerQueueSoftLimit: 2,
        simulationQueueSoftLimit: 2,
        eventLoopP95SoftLimitMs: 60,
        eventLoopUtilizationSoftLimitPct: 65
      },
      now: () => nowMs,
      contextTtlMs: 500,
      getAllPlayers: () => [],
      onlineHumanPlayerCount: () => 0,
      latestRuntimeVitalsSample: () => undefined,
      pendingAuthVerifications: () => 0,
      authPriorityUntil: () => 0,
      aiQueueDepth: () => 0,
      simulationQueueDepth: () => 0,
      humanChunkSnapshotPriorityActive: () => false,
      collectCompetitionMetrics,
      incomeForMetric: (metric) => metric.incomePerMinute,
      playerIdForMetric: (metric) => metric.playerId,
      computeTargets: () => ({ townsTarget: 1, settledTilesTarget: 2 }),
      createTickContext: (cycleId, context) => ({
        cycleId,
        context
      }),
      enqueueAiWorkerJob: () => undefined,
      runtimeMemoryStats: () => ({
        rssMb: 0,
        heapUsedMb: 0,
        heapTotalMb: 0,
        externalMb: 0,
        arrayBuffersMb: 0
      }),
      pushAiTickPerf: () => undefined,
      onSlowAiTick: () => undefined
    });

    const first = runtime.getCompetitionContext();
    const second = runtime.getCompetitionContext();
    expect(first).toBe(second);
    expect(collectCompetitionMetrics).toHaveBeenCalledTimes(1);

    nowMs += 600;
    const third = runtime.getCompetitionContext();
    expect(third).not.toBe(first);
    expect(collectCompetitionMetrics).toHaveBeenCalledTimes(2);
  });
});
