import { describe, expect, it } from "vitest";
import type { ScoutDroneFlight } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import { scoutPlanRouteKey } from "./client-map-3d-scout-drone-plan-overlay.js";

describe("scoutPlanRouteKey", () => {
  // Review 2026-11-21: with the map unchanged, the route stayed drawn from where the drone used to be.
  it("changes as the flying drone moves on and once it lands, with the plan and map unchanged", () => {
    const state = createInitialState();
    state.scoutDronePicking = { active: true, stops: [{ x: 9, y: 9 }], bumpAt: 0, shakeAt: 0, launches: 0 };
    const flight: ScoutDroneFlight = { launchedAt: 0, landsAt: 3_000, targetX: 2, targetY: 0, turnIndex: 2, endReason: "TARGET", steps: [{ x: 0, y: 0, at: 0 }, { x: 1, y: 0, at: 1_000 }, { x: 2, y: 0, at: 2_000 }, { x: 1, y: 0, at: 3_000 }] };
    state.scoutDroneFlight = flight;
    const early = scoutPlanRouteKey(state, 500);
    const later = scoutPlanRouteKey(state, 2_500);
    const landed = scoutPlanRouteKey(state, 3_500);
    expect(new Set([early, later, landed]).size).toBe(3);
    expect(scoutPlanRouteKey(state, 600)).toBe(early);
  });
});
