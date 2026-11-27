import { describe, expect, it } from "vitest";
import {
  MUSTER_FLAG_PLAN_MAX_ENTRIES,
  MUSTER_FLAG_PLAN_TTL_MS,
  clearMusterFlagPlan,
  setMusterFlagPlan,
  takeMusterFlagPlan,
  type MusterFlagPlanEntry
} from "./client-muster-flag-plan.js";

const fresh = () => ({ musterFlagPlanByTargetKey: new Map<string, MusterFlagPlanEntry>() });

describe("muster flag plan", () => {
  it("returns the planned spot once, then forgets it", () => {
    const state = fresh();
    setMusterFlagPlan(state, { x: 5, y: 5 }, { x: 2, y: 5 }, 1_000);
    expect(takeMusterFlagPlan(state, 5, 5, 1_000)).toEqual({ x: 2, y: 5 });
    expect(takeMusterFlagPlan(state, 5, 5, 1_000)).toBeUndefined();
  });

  it("drops an expired plan", () => {
    const state = fresh();
    setMusterFlagPlan(state, { x: 5, y: 5 }, { x: 2, y: 5 }, 1_000);
    expect(takeMusterFlagPlan(state, 5, 5, 1_000 + MUSTER_FLAG_PLAN_TTL_MS + 1)).toBeUndefined();
    expect(state.musterFlagPlanByTargetKey.size).toBe(0);
  });

  it("clears a plan", () => {
    const state = fresh();
    setMusterFlagPlan(state, { x: 5, y: 5 }, { x: 2, y: 5 });
    clearMusterFlagPlan(state, 5, 5);
    expect(takeMusterFlagPlan(state, 5, 5)).toBeUndefined();
  });

  it("stays within its size bound, evicting the oldest", () => {
    const state = fresh();
    for (let i = 0; i <= MUSTER_FLAG_PLAN_MAX_ENTRIES; i += 1) setMusterFlagPlan(state, { x: i, y: 0 }, { x: i, y: 1 }, 1_000);
    expect(state.musterFlagPlanByTargetKey.size).toBe(MUSTER_FLAG_PLAN_MAX_ENTRIES);
    expect(takeMusterFlagPlan(state, 0, 0, 1_000)).toBeUndefined();
    expect(takeMusterFlagPlan(state, MUSTER_FLAG_PLAN_MAX_ENTRIES, 0, 1_000)).toEqual({ x: MUSTER_FLAG_PLAN_MAX_ENTRIES, y: 1 });
  });
});
