import { describe, expect, it } from "vitest";
import { WaypointDrainScheduler, tickWaypointDrain } from "./runtime-waypoint-drain-scheduler.js";

describe("WaypointDrainScheduler", () => {
  it("is not drain-eligible immediately on disconnect, and becomes eligible only after the grace period", () => {
    // Test 4: disconnect inside the grace window -> zero dispatches; after
    // the window, drains.
    let subscribed = true;
    let now = 0;
    const scheduler = new WaypointDrainScheduler({ isPlayerSubscribed: () => subscribed, now: () => now });

    subscribed = false;
    now = 1_000; // just disconnected
    expect(scheduler.isDrainEligible("p1")).toBe(false);

    now = 1_000 + 14_999; // still inside the 15s grace window
    expect(scheduler.isDrainEligible("p1")).toBe(false);

    now = 1_000 + 15_000; // grace period elapsed
    expect(scheduler.isDrainEligible("p1")).toBe(true);
  });

  it("clears the disconnect timestamp instantly on reconnect", () => {
    let subscribed = false;
    let now = 0;
    const scheduler = new WaypointDrainScheduler({ isPlayerSubscribed: () => subscribed, now: () => now });

    expect(scheduler.isDrainEligible("p1")).toBe(false); // records disconnect at now=0
    now = 20_000;
    expect(scheduler.isDrainEligible("p1")).toBe(true);

    subscribed = true;
    expect(scheduler.isDrainEligible("p1")).toBe(false);
    expect(scheduler.lastDisconnectedAt("p1")).toBeUndefined();
  });

  it("a page refresh (brief disconnect well under the grace period) never becomes drain-eligible", () => {
    let subscribed = false;
    let now = 0;
    const scheduler = new WaypointDrainScheduler({ isPlayerSubscribed: () => subscribed, now: () => now });

    now = 100;
    expect(scheduler.isDrainEligible("p1")).toBe(false);
    now = 400; // 300ms later -- a flaky reconnect blip
    subscribed = true;
    expect(scheduler.isDrainEligible("p1")).toBe(false);
  });
});

describe("tickWaypointDrain", () => {
  it("drains only players the scheduler reports as eligible", () => {
    const eligible = new Set(["p1"]);
    const scheduler = { isDrainEligible: (playerId: string) => eligible.has(playerId) } as unknown as WaypointDrainScheduler;
    const drained: string[] = [];

    tickWaypointDrain({
      scheduler,
      playerIdsWithWaypointQueue: () => ["p1", "p2"],
      drainForPlayer: (playerId) => drained.push(playerId)
    });

    expect(drained).toEqual(["p1"]);
  });
});
