import { describe, expect, it, vi } from "vitest";
import { createRenderCaptureProgress } from "./client-bootstrap-capture-progress.js";

describe("createRenderCaptureProgress", () => {
  it("holds capture alerts back while the map-loading overlay is active", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_000);
    const card = { style: { display: "grid" }, dataset: {} };
    const state = {
      connection: "connecting", firstChunkAt: 0, hasEverInitialized: false, disconnectedSince: 0,
      seasonPending: false, needsSeasonJoin: false, joinSeasonOverlayOpen: false,
      captureAlert: { title: "Truce offer received", detail: "x", until: 1_500, tone: "warn" }
    };
    const render = createRenderCaptureProgress(state as never, { captureCardEl: card }, {} as never);
    render();
    expect(card.style.display).toBe("none");
    expect(state.captureAlert.until).toBeGreaterThan(10_000);
    vi.restoreAllMocks();
  });
});
