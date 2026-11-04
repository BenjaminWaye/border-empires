import { describe, expect, it, vi } from "vitest";
import { handleIntelResult } from "./client-network-intel-result.js";
import type { ClientState } from "../client-state/client-state.js";

describe("handleIntelResult SURVEY_SWEEP_RESULT", () => {
  it("records the findings as a focusable activity feed entry", () => {
    const state = { feed: [], surveySweepPings: [] } as unknown as ClientState;
    const pushFeed = vi.fn();
    const handled = handleIntelResult(
      { type: "SURVEY_SWEEP_RESULT", pings: [{ x: 7, y: 9, kind: "resource" }] },
      state,
      pushFeed,
      vi.fn()
    );
    expect(handled).toBe(true);
    expect(state.surveySweepPings).toHaveLength(1);
    expect(state.feed[0]).toMatchObject({ focusX: 7, focusY: 9 });
    expect(state.feed[0]?.text).toContain("Resources: (7, 9).");
    expect(pushFeed).not.toHaveBeenCalled();
  });
});
