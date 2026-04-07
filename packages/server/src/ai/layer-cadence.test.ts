import { describe, expect, it } from "vitest";

import { createAiLayerCadenceState, markAiLayerRefreshed, shouldRefreshAiLayer } from "./layer-cadence.js";

describe("ai layer cadence", () => {
  it("refreshes when no prior layer state exists", () => {
    const state = createAiLayerCadenceState();

    expect(shouldRefreshAiLayer(state, "priority", 1_000, 5_000, "sig-a")).toBe(true);
  });

  it("skips refresh inside the cadence window when the signature is unchanged", () => {
    const state = createAiLayerCadenceState();
    markAiLayerRefreshed(state, "priority", 1_000, "sig-a");

    expect(shouldRefreshAiLayer(state, "priority", 2_000, 5_000, "sig-a")).toBe(false);
  });

  it("refreshes immediately when the signature changes", () => {
    const state = createAiLayerCadenceState();
    markAiLayerRefreshed(state, "priority", 1_000, "sig-a");

    expect(shouldRefreshAiLayer(state, "priority", 2_000, 5_000, "sig-b")).toBe(true);
  });
});
