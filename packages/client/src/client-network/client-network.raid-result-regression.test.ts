import { describe, expect, it, vi } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

describe("client network regression guards — RAID_RESULT", () => {
  it("posts a Go to tile Activity Feed entry for RAID_RESULT, naming the attacker and what was pillaged", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    ws.emit("message", {
      data: JSON.stringify({
        type: "RAID_RESULT",
        commandId: "cmd-raid-1",
        attackerId: "rival-1",
        target: { x: 12, y: 18 },
        pillagedGold: 132.5,
        pillagedStrategic: { FOOD: 4 }
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "Raided by rival-1 at (12, 18). Lost ◉ 132.50, 🍞 4 Food.",
      type: "combat",
      severity: "error",
      at: expect.any(Number),
      focusX: 12,
      focusY: 18,
      actionLabel: "Go to tile"
    });
  });

  it("posts a RAID_RESULT Activity Feed entry with no loss detail when nothing was pillaged", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    ws.emit("message", {
      data: JSON.stringify({
        type: "RAID_RESULT",
        commandId: "cmd-raid-2",
        attackerId: "rival-1",
        target: { x: 12, y: 18 }
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "Raided by rival-1 at (12, 18).",
      type: "combat",
      severity: "error",
      at: expect.any(Number),
      focusX: 12,
      focusY: 18,
      actionLabel: "Go to tile"
    });
  });
});
