import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression for the "why was this command slow to apply" diagnostic gap:
// wrapJobRun/onJobApplied previously only carried {lane, commandType}, so a
// slow individual command apply couldn't be correlated back to its
// commandId (and therefore not back to the gateway's websocket reply for
// that specific player action). Pins that commandId now flows through both
// hooks for a submitted human command.
describe("simulation runtime — command id job metadata", () => {
  it("passes commandId through wrapJobRun and onJobApplied for a submitted command", () => {
    const scheduled: Array<() => void> = [];
    const wrapJobRunMeta: Array<{ lane: string; commandType?: string; commandId?: string }> = [];
    const onJobAppliedSamples: Array<{ lane: string; commandType?: string; commandId?: string }> = [];

    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleSoon: (task) => {
        scheduled.push(task);
      },
      now: () => 1_000,
      wrapJobRun: (run, meta) => {
        wrapJobRunMeta.push(meta);
        return run;
      },
      onJobApplied: (sample) => {
        onJobAppliedSamples.push(sample);
      }
    });

    runtime.submitCommand({
      commandId: "human-cmd-123",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 4, fromY: 4, toX: 5, toY: 4 })
    });

    for (const task of scheduled) task();

    expect(wrapJobRunMeta).toHaveLength(1);
    expect(wrapJobRunMeta[0]).toEqual({ lane: "human_interactive", commandType: "ATTACK", commandId: "human-cmd-123" });

    expect(onJobAppliedSamples).toHaveLength(1);
    expect(onJobAppliedSamples[0]).toMatchObject({
      lane: "human_interactive",
      commandType: "ATTACK",
      commandId: "human-cmd-123"
    });
  });

  it("omits commandId from job metadata for internal jobs enqueued without one (e.g. background housekeeping)", () => {
    const scheduled: Array<() => void> = [];
    const wrapJobRunMeta: Array<{ lane: string; commandType?: string; commandId?: string }> = [];

    const runtime = new SimulationRuntime({
      seedProfile: "stress-10ai",
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      now: () => 1_000,
      wrapJobRun: (run, meta) => {
        wrapJobRunMeta.push(meta);
        return run;
      }
    });

    let ran = false;
    runtime.enqueueBackgroundJob(() => {
      ran = true;
    });
    for (const task of scheduled) task();

    expect(ran).toBe(true);
    expect(wrapJobRunMeta).toHaveLength(1);
    expect(wrapJobRunMeta[0]).toEqual({ lane: "ai" });
  });
});
