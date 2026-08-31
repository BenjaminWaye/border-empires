import { describe, expect, it, vi } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

describe("client network AETHER_PURGE_ALERT regression guard", () => {
  it("emits AETHER_PURGE_ALERT via pushFeedEntry with drastic copy and focus coordinates", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    ws.emit("message", {
      data: JSON.stringify({
        type: "AETHER_PURGE_ALERT",
        attackerName: "AttackerPlayer",
        attackerId: "player-2",
        x: 5,
        y: 0
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "Aether Attack! We have been the target of an Aether Purge by AttackerPlayer — we lost control of (5, 0).",
      type: "combat",
      severity: "error",
      at: expect.any(Number),
      focusX: 5,
      focusY: 0,
      actionLabel: "Center"
    });
  });
});
