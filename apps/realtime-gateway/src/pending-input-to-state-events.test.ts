import { describe, expect, it, vi } from "vitest";

import { buildPendingInputToStateEvents, sweepStalePendingInputToState } from "./pending-input-to-state-events.js";

describe("pending input-to-state events", () => {
  it("builds sorted events with warn level for entries pending >= 5s", () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    try {
      const pending = new Map<string, number>([
        ["cmd-new", 9_000], // 1s old -> info
        ["cmd-old", 3_000] // 7s old -> warn
      ]);

      const events = buildPendingInputToStateEvents(pending, { connected: true, lastError: undefined });

      expect(events).toEqual([
        {
          at: 3_000,
          level: "warn",
          event: "pending_input_to_state",
          payload: { commandId: "cmd-old", ageMs: 7_000, simulationConnected: true, simulationLastError: "" }
        },
        {
          at: 9_000,
          level: "info",
          event: "pending_input_to_state",
          payload: { commandId: "cmd-new", ageMs: 1_000, simulationConnected: true, simulationLastError: "" }
        }
      ]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sweeps only entries older than the stale cutoff, leaving newer ones tracked", () => {
    const pending = new Map<string, number>([
      ["stale-cmd", 1_000],
      ["fresh-cmd", 5_000]
    ]);

    sweepStalePendingInputToState(pending, 2_000);

    expect([...pending.keys()]).toEqual(["fresh-cmd"]);
  });
});
