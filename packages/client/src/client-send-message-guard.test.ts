import { describe, expect, it, vi } from "vitest";

import { blockUnsupportedRewriteMessage } from "./client-send-message-guard.js";

describe("blockUnsupportedRewriteMessage", () => {
  it("blocks unsupported rewrite messages locally", () => {
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();

    const blocked = blockUnsupportedRewriteMessage(
      { type: "ALLIANCE_REQUEST", targetPlayerName: "Valka" },
      {
        state: { serverSupportedMessageTypes: new Set(["ATTACK", "EXPAND"]) },
        pushFeed,
        showCaptureAlert
      }
    );

    expect(blocked).toBe(true);
    expect(pushFeed).toHaveBeenCalledWith(
      expect.stringContaining("Alliance requests are not yet migrated to the rewrite gateway."),
      "error",
      "warn"
    );
    expect(showCaptureAlert).toHaveBeenCalledWith(
      "Action unavailable",
      expect.stringContaining("Alliance requests are not yet migrated to the rewrite gateway."),
      "warn"
    );
  });

  it("allows supported rewrite messages through", () => {
    const blocked = blockUnsupportedRewriteMessage(
      { type: "ATTACK", fromX: 1, fromY: 1, toX: 2, toY: 1 },
      {
        state: { serverSupportedMessageTypes: new Set(["ATTACK", "EXPAND"]) },
        pushFeed: vi.fn()
      }
    );

    expect(blocked).toBe(false);
  });
});
