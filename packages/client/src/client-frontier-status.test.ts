import { describe, expect, it, vi } from "vitest";

import { clearFrontierStatusAlert, showRecoveredFrontierAlert } from "./client-frontier-status.js";

describe("client frontier status alerts", () => {
  it("clears managed frontier warning titles including expansion sync stalls", () => {
    const state = {
      captureAlert: {
        title: "Expansion sync delayed",
        detail: "debug me",
        until: Date.now() + 12_000,
        tone: "warn" as const
      }
    };

    clearFrontierStatusAlert(state);

    expect(state.captureAlert).toBeUndefined();
  });

  it("keeps unrelated capture alerts intact", () => {
    const state = {
      captureAlert: {
        title: "Town unfed",
        detail: "feed it",
        until: Date.now() + 12_000,
        tone: "warn" as const
      }
    };

    clearFrontierStatusAlert(state);

    expect(state.captureAlert).toEqual(
      expect.objectContaining({
        title: "Town unfed"
      })
    );
  });

  it("shows recovery copy for delayed expands", () => {
    const showCaptureAlert = vi.fn();

    showRecoveredFrontierAlert(
      {
        actionCurrent: { x: 10, y: 11, retries: 0, actionType: "EXPAND" },
        actionAcceptedAck: false,
        captureAlert: undefined
      },
      showCaptureAlert
    );

    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Recovering expansion",
      "Waiting for server confirmation after reconnect.",
      "warn"
    );
  });
});
