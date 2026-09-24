import { describe, expect, it } from "vitest";

import { EMPIRE_STORAGE_FLOOR, STORAGE_MINUTES } from "../runtime-empire-storage.js";
import type { RuntimeAiPlayerMetricsRow } from "../runtime-ai-player-metrics-row.js";
import { applyAiPlayerDebugSnapshotToMetrics, createAiPlayerStateMetrics } from "./metrics-ai-player-state.js";

const row: RuntimeAiPlayerMetricsRow = {
  id: "ai-x", isAi: true, points: 0, incomePerMinute: 0, settledTileCount: 0, ownedTileCount: 0,
  manpower: 0, manpowerCap: 0, manpowerRegenPerMinute: 0, musterFlagCount: 0, musterStagedManpower: 0, musterFlagCapacity: 0
};

describe("applyAiPlayerDebugSnapshotToMetrics", () => {
  it("maps exportAiPlayerMetricsSnapshot() rows onto the gold/gold-capacity/tile gauges", () => {
    const metrics = createAiPlayerStateMetrics();
    applyAiPlayerDebugSnapshotToMetrics(
      [
        { ...row, id: "ai-1", points: 27_856, incomePerMinute: 125, settledTileCount: 12, ownedTileCount: 87 },
        // Zero income pins that the floor (not incomePerMinute * STORAGE_MINUTES = 0) wins here.
        {
          ...row, id: "ai-2", points: 2_921, incomePerMinute: 0, settledTileCount: 3, ownedTileCount: 21,
          manpower: 0.14, manpowerCap: 1_500, manpowerRegenPerMinute: 0.9,
          musterFlagCount: 1, musterStagedManpower: 120, musterFlagCapacity: 150
        }
      ],
      metrics.setSimAiPlayerState
    );

    const sample = metrics.snapshot();
    expect(sample.simAiPlayerGoldGauge).toEqual({ "ai-1": 27_856, "ai-2": 2_921 });
    expect(sample.simAiPlayerGoldCapacityGauge["ai-1"]).toBe(Math.max(EMPIRE_STORAGE_FLOOR.GOLD, 125 * STORAGE_MINUTES));
    expect(sample.simAiPlayerGoldCapacityGauge["ai-2"]).toBe(EMPIRE_STORAGE_FLOOR.GOLD);
    expect(sample.simAiPlayerSettledTilesGauge).toEqual({ "ai-1": 12, "ai-2": 3 });
    expect(sample.simAiPlayerOwnedTilesGauge).toEqual({ "ai-1": 87, "ai-2": 21 });
    expect(sample.simAiPlayerManpowerGauge).toEqual({ "ai-1": 0, "ai-2": 0.14 });
    expect(sample.simAiPlayerManpowerCapGauge["ai-2"]).toBe(1_500);
    expect(sample.simAiPlayerManpowerRegenPerMinuteGauge["ai-2"]).toBe(0.9);
    expect(sample.simAiPlayerMusterFlagsGauge).toEqual({ "ai-1": 0, "ai-2": 1 });
    expect(sample.simAiPlayerMusterStagedManpowerGauge["ai-2"]).toBe(120);
    expect(sample.simAiPlayerMusterFlagCapacityGauge["ai-2"]).toBe(150);
  });

  it("does not require re-filtering isAi — the caller (runtime.exportAiPlayerMetricsSnapshot) is expected to already be AI-only", () => {
    const metrics = createAiPlayerStateMetrics();
    // Every row passed in gets applied, regardless of its isAi field — this
    // pins that applyAiPlayerDebugSnapshotToMetrics trusts its input rather
    // than re-scanning, matching runtime.exportAiPlayerMetricsSnapshot()'s
    // contract of only ever returning AI players.
    applyAiPlayerDebugSnapshotToMetrics(
      [{ ...row, id: "ai-1", points: 100, incomePerMinute: 1 }],
      metrics.setSimAiPlayerState
    );
    expect(metrics.snapshot().simAiPlayerGoldGauge).toEqual({ "ai-1": 100 });
  });
});
