import { describe, expect, it } from "vitest";
import { createEmptyPlayerRuntimeSummary } from "./player-runtime-summary.js";
import { AI_AFC_REPLACEMENT_DELAY_MS, scheduleAiReplacementAfc, type RuntimeRespawnContext } from "./runtime-respawn-helpers.js";

// Only the fields scheduleAiReplacementAfc reads before its timer fires.
const contextWith = (isAi: boolean, delays: number[]): RuntimeRespawnContext =>
  ({
    players: new Map([["ai-1", { id: "ai-1", isAi }]]),
    summaryForPlayer: () => createEmptyPlayerRuntimeSummary(),
    scheduleAfter: (delayMs: number) => { delays.push(delayMs); }
  }) as unknown as RuntimeRespawnContext;

describe("scheduleAiReplacementAfc", () => {
  it("queues one 10-minute timer per AFC-less AI, however many tiles it keeps losing", () => {
    const delays: number[] = [];
    const ctx = contextWith(true, delays);
    scheduleAiReplacementAfc(ctx, "ai-1", "loss-1");
    scheduleAiReplacementAfc(ctx, "ai-1", "loss-2");
    scheduleAiReplacementAfc(ctx, "ai-1", "loss-3");
    expect(delays).toEqual([AI_AFC_REPLACEMENT_DELAY_MS]);
  });

  it("never queues one for a human", () => {
    const delays: number[] = [];
    scheduleAiReplacementAfc(contextWith(false, delays), "ai-1", "loss-1");
    expect(delays).toEqual([]);
  });
});
