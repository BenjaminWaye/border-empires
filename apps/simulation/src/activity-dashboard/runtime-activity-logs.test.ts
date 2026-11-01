import { describe, expect, it } from "vitest";

import { createRuntimeActivityLogs } from "./runtime-activity-logs.js";

// Regression: barbarian walks logged every step onto neutral land (but never
// the release behind them), ~47k entries/day against a 50k cap, which both
// inflated the barbarian's territory momentum and evicted player history.
describe("createRuntimeActivityLogs territory flips", () => {
  it("drops barbarian roaming over neutral land but keeps flips involving players", () => {
    const logs = createRuntimeActivityLogs(() => 1_000);
    const base = { x: 1, y: 1, at: 1_000 };
    logs.recordTileFlip({ ...base, tileId: "t-1", fromOwner: undefined, toOwner: "barbarian-1" });
    logs.recordTileFlip({ ...base, tileId: "t-2", fromOwner: "barbarian-1", toOwner: undefined });
    logs.recordTileFlip({ ...base, tileId: "t-3", fromOwner: "p1", toOwner: "barbarian-1" });
    logs.recordTileFlip({ ...base, tileId: "t-4", fromOwner: "barbarian-1", toOwner: "p1" });
    logs.recordTileFlip({ ...base, tileId: "t-5", fromOwner: undefined, toOwner: "p1" });
    expect(logs.territoryGauge().entryCount).toBe(3);
  });
});
