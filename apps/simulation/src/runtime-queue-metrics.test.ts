import { describe, expect, it } from "vitest";

import { computeQueueBacklogMs, computeQueueDepths } from "./runtime-queue-metrics.js";

const emptyLanes = { human_interactive: [], human_noninteractive: [], system: [], ai: [] };

describe("runtime queue metrics", () => {
  it("computes per-lane job counts", () => {
    const jobsByLane = {
      ...emptyLanes,
      human_interactive: [{ enqueuedAt: 1 }, { enqueuedAt: 2 }],
      ai: [{ enqueuedAt: 3 }]
    };
    expect(computeQueueDepths(jobsByLane)).toEqual({
      human_interactive: 2,
      human_noninteractive: 0,
      system: 0,
      ai: 1
    });
  });

  it("computes per-lane backlog as age of the oldest job, zero for empty lanes", () => {
    const jobsByLane = {
      ...emptyLanes,
      human_interactive: [{ enqueuedAt: 900 }, { enqueuedAt: 950 }],
      system: [{ enqueuedAt: 100 }]
    };
    expect(computeQueueBacklogMs(jobsByLane, 1_000)).toEqual({
      human_interactive: 100,
      human_noninteractive: 0,
      system: 900,
      ai: 0
    });
  });
});
