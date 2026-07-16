import { describe, expect, it } from "vitest";

import { createAiTrainingRecorder } from "./ai-training-recorder.js";

describe("createAiTrainingRecorder", () => {
  it("reports enabled=false when no output path is configured", () => {
    expect(createAiTrainingRecorder(undefined).enabled).toBe(false);
    expect(createAiTrainingRecorder("").enabled).toBe(false);
    expect(createAiTrainingRecorder("   ").enabled).toBe(false);
  });

  it("reports enabled=true when an output path is configured", () => {
    // The planner-worker gates buildAiTrainingRecord (which sorts full tile
    // arrays every plan) on this flag, so it must flip on for a real path.
    expect(createAiTrainingRecorder("/tmp/ai-training-test.jsonl").enabled).toBe(true);
  });
});
