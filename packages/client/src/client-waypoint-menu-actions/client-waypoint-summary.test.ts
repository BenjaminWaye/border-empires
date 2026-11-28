import { describe, expect, it } from "vitest";
import type { WaypointPlan, WaypointStep } from "@border-empires/shared";

import { formatWaypointSummary } from "./client-waypoint-menu-actions.js";

const step = (manpowerCost: number, action: WaypointStep["action"] = "EXPAND"): WaypointStep => ({
  origin: { x: 0, y: 0 }, target: { x: 1, y: 0 }, action, durationMs: 7_600, goldCost: 0, manpowerCost, manpowerMin: manpowerCost, throughFog: false, viaDock: false
});

const plan = (steps: WaypointStep[]): WaypointPlan => ({
  target: { x: 5, y: 0 },
  steps,
  totalGold: 0,
  totalManpower: steps.reduce((sum, s) => sum + s.manpowerCost, 0),
  totalDurationMs: steps.reduce((sum, s) => sum + s.durationMs, 0),
  expandCount: steps.filter((s) => s.action === "EXPAND").length,
  attackCount: steps.filter((s) => s.action === "ATTACK").length,
  reachable: true
});

// First-15 playtest 2026-11-28: "Expand To — 5 expand — 50 manpower", then the counter fell by 10, then 20, and the
// player couldn't tell what they had paid. Each claim is charged as it is sent; the summary now says the per-tile price.
describe("formatWaypointSummary", () => {
  it("names the per-tile price for a multi-claim route", () => {
    expect(formatWaypointSummary(plan([step(10), step(10), step(10), step(10), step(10)]))).toBe("5 expand — 50 manpower (10 per tile), ~38s");
  });

  it("keeps a single claim to its one price", () => {
    expect(formatWaypointSummary(plan([step(10)]))).toBe("1 expand — 10 manpower, ~8s");
  });

  it("gives only the total when steps cost different amounts", () => {
    expect(formatWaypointSummary(plan([step(10), step(40, "ATTACK")]))).toBe("1 expand + 1 attack — 50 manpower, ~15s");
  });
});
