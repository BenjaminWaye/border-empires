import { describe, expect, it } from "vitest";

import { buildPlannerRelevantTileKeys } from "./planner-sync-scope.js";
import type { PlannerPlayerView } from "./planner-world-view.js";

const makePlayer = (overrides: Partial<PlannerPlayerView> = {}): PlannerPlayerView => ({
  id: "p1",
  points: 0,
  manpower: 0,
  tileCollectionVersion: 1,
  hasActiveLock: false,
  territoryTileKeys: [],
  frontierTileKeys: [],
  pendingSettlementTileKeys: [],
  activeDevelopmentProcessCount: 0,
  ...overrides
});

describe("buildPlannerRelevantTileKeys", () => {
  it("includes radius around territory, frontier, and pending-settlement tiles", () => {
    const keys = buildPlannerRelevantTileKeys([
      makePlayer({
        territoryTileKeys: ["10,10"],
        frontierTileKeys: ["20,20"],
        pendingSettlementTileKeys: ["30,30"]
      })
    ]);

    expect(keys.has("10,10")).toBe(true);
    expect(keys.has("12,12")).toBe(true);
    expect(keys.has("20,22")).toBe(true);
    expect(keys.has("30,28")).toBe(true);
    expect(keys.has("40,40")).toBe(false);
  });

  it("unions scoped keys across players", () => {
    const keys = buildPlannerRelevantTileKeys([
      makePlayer({ id: "p1", territoryTileKeys: ["0,0"] }),
      makePlayer({ id: "p2", territoryTileKeys: ["50,50"] })
    ], 0);

    expect(keys).toEqual(new Set(["0,0", "50,50"]));
  });
});
