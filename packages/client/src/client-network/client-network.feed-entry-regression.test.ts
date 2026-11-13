import { describe, expect, it, vi } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

// Extracted from client-network.error-regression.test.ts (over the line cap).
// Incoming attacks and server event-log entries are background notices with
// their own UI, so they reach the feed flagged feedOnly and are never mirrored
// onto the alert card (client-alerts/client-feed-alert-surface.ts).
describe("client network feed entries for attacks and the event log", () => {
  it("emits ATTACK_ALERT via pushFeedEntry with focus coordinates", () => {
    const state = createState();
    state.unreadAttackAlerts = 0;
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    ws.emit("message", {
      data: JSON.stringify({
        type: "ATTACK_ALERT",
        attackerName: "AttackerPlayer",
        attackerId: "player-2",
        x: 42,
        y: 77,
        resolvesAt: Date.now() + 5000,
        fromX: 40,
        fromY: 75
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "Under attack: AttackerPlayer is striking (42, 77) from (40, 75).",
      type: "combat",
      severity: "error",
      feedOnly: true,
      at: expect.any(Number),
      focusX: 42,
      focusY: 77,
      actionLabel: "Center"
    });
    expect(state.incomingAttacksByTile.get("42,77")).toBeDefined();
    expect(state.unreadAttackAlerts).toBe(1);
  });

  it("echoes new PLAYER_UPDATE eventLog entries into the Activity Feed, with a Go to tile button when tile coordinates are present", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    // First sync just seeds seen-ids so pre-existing history isn't backfilled.
    ws.emit("message", { data: JSON.stringify({ type: "PLAYER_UPDATE", eventLog: [] }) });
    expect(pushFeedEntry).not.toHaveBeenCalled();

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_UPDATE",
        eventLog: [{ id: "town-lost-1", type: "TOWN_LOST", text: "Home was captured by Rival.", occurredAt: 1_000, x: 12, y: 18 }]
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "Home was captured by Rival.",
      type: "combat",
      severity: "error",
      feedOnly: true,
      at: 1_000,
      focusX: 12,
      focusY: 18,
      actionLabel: "Go to tile"
    });
  });

  it("omits focus coordinates for eventLog entries without a tile", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    const pushFeedEntry = vi.fn();
    bindWithDeps(state, ws, { pushFeedEntry });

    ws.emit("message", { data: JSON.stringify({ type: "PLAYER_UPDATE", eventLog: [] }) });

    ws.emit("message", {
      data: JSON.stringify({
        type: "PLAYER_UPDATE",
        eventLog: [{ id: "levy-1", type: "IMPERIAL_EXCHANGE_LEVY_HIT", text: "You were hit for 50 gold.", occurredAt: 2_000 }]
      })
    });

    expect(pushFeedEntry).toHaveBeenCalledWith({
      text: "You were hit for 50 gold.",
      type: "combat",
      severity: "warn",
      feedOnly: true,
      at: 2_000
    });
  });
});
