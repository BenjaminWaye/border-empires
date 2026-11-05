import { describe, expect, it, vi } from "vitest";
import { pauseWaypointForManpowerIfNeeded } from "./client-waypoint-manpower-pause.js";

const expandStep = (manpowerMin: number) => ({ action: "EXPAND" as const, manpowerMin, target: { x: 3, y: 4 } });

describe("pauseWaypointForManpowerIfNeeded", () => {
  it("pauses on the live EXPAND price when it has risen above the planned step price", () => {
    // Planned at 13 MP; the route's own claims pushed the frontier past a price step to 15.
    const waypoint = { pausedForManpower: false };
    const pushFeed = vi.fn();
    expect(pauseWaypointForManpowerIfNeeded(waypoint, expandStep(13), 14, pushFeed, 15)).toBe(true);
    expect(waypoint.pausedForManpower).toBe(true);
    expect(pushFeed).toHaveBeenCalledWith(expect.stringContaining("needs 15 manpower"), "info", "warn");
  });

  it("keeps going once manpower covers the higher of the planned and live price", () => {
    const waypoint = { pausedForManpower: true };
    const pushFeed = vi.fn();
    expect(pauseWaypointForManpowerIfNeeded(waypoint, expandStep(13), 15, pushFeed, 15)).toBe(false);
    expect(waypoint.pausedForManpower).toBe(false);
  });

  it("never pauses ATTACK steps on the pool", () => {
    const waypoint = { pausedForManpower: false };
    const attack = { action: "ATTACK" as const, manpowerMin: 60, target: { x: 3, y: 4 } };
    expect(pauseWaypointForManpowerIfNeeded(waypoint, attack, 0, vi.fn(), 15)).toBe(false);
  });
});
