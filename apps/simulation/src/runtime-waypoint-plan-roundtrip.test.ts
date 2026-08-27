import { describe, expect, it } from "vitest";
import { createPlayerRuntimeSummaryFromRecovered } from "./player-runtime-summary.js";
import type { ServerWaypointQueueEntry } from "./player-runtime-summary.js";

// Test 1 (docs/waypoint-client-planning-plan.md): steps[] survives enqueue
// -> snapshot -> export -> recovery round-trip, cursor included -- the
// #1618 shape of bug (a field silently missing from one of the several
// serialization points this queue passes through).
describe("ServerWaypointQueueEntry -- steps[]/cursor round-trip", () => {
  const entry: ServerWaypointQueueEntry = {
    target: { x: 10, y: 10 },
    queuedAt: 1_000,
    planId: "plan-abc",
    plannedAt: 500,
    steps: [
      { origin: { x: 8, y: 10 }, target: { x: 9, y: 10 }, action: "EXPAND" },
      { origin: { x: 9, y: 10 }, target: { x: 10, y: 10 }, action: "EXPAND" }
    ],
    cursor: 1,
    stalled: false
  };

  it("round-trips through the recovery-snapshot reconstructor unchanged, including cursor", () => {
    // runtime-snapshot-sections.ts spreads the whole entry (current-value
    // snapshot style, like strategicResources) into initialState.players[],
    // and createPlayerRuntimeSummaryFromRecovered reads it back the same
    // way event-recovery-player-state.ts's RecoveredPlayerState does after a
    // cold boot -- exercise that exact path.
    const restored = createPlayerRuntimeSummaryFromRecovered({ waypointQueue: [entry] });

    expect(restored.waypointQueue).toEqual([entry]);
    expect(restored.waypointQueue[0]!.cursor).toBe(1);
    expect(restored.waypointQueue[0]!.steps).toEqual(entry.steps);
  });

  it("clones the target so mutating the restored entry cannot corrupt the original", () => {
    const restored = createPlayerRuntimeSummaryFromRecovered({ waypointQueue: [entry] });
    restored.waypointQueue[0]!.target.x = 999;
    expect(entry.target.x).toBe(10);
  });
});
