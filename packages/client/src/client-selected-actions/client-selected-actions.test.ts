import { describe, expect, it, vi } from "vitest";
import { buildFortOnSelected, buildSiegeOutpostOnSelected, cancelOngoingCapture } from "./client-selected-actions.js";
import { createInitialState } from "../client-state/client-state.js";

describe("selected action helpers", () => {
  it("shows a visible warning when a selected action is blocked before sending", () => {
    const pushFeed = vi.fn();
    const showCaptureAlert = vi.fn();
    const sendGameMessage = vi.fn(() => true);

    buildFortOnSelected(
      { selected: undefined, tiles: new Map() },
      {
        keyFor: (x, y) => `${x},${y}`,
        pushFeed,
        showCaptureAlert,
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(showCaptureAlert).toHaveBeenCalledWith("Action blocked", "Select an owned border/dock tile first.", "warn");
    expect(pushFeed).toHaveBeenCalledWith("Select an owned border/dock tile first.", "error", "warn");
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("sends fort builds with the supported gateway message", () => {
    const sendGameMessage = vi.fn(() => true);

    buildFortOnSelected(
      { selected: { x: 10, y: 11 }, tiles: new Map() },
      {
        keyFor: (x, y) => `${x},${y}`,
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "BUILD_FORT", x: 10, y: 11 });
  });

  it("sends siege outpost builds with the supported gateway message", () => {
    const sendGameMessage = vi.fn(() => true);

    buildSiegeOutpostOnSelected(
      { selected: { x: 12, y: 13 }, tiles: new Map() },
      {
        keyFor: (x, y) => `${x},${y}`,
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "BUILD_SIEGE_OUTPOST", x: 12, y: 13 });
  });
});

describe("cancelOngoingCapture", () => {
  it("drops only the most recently queued pending muster attack, leaving the flag and other targets alone", () => {
    const state = createInitialState();
    state.pendingMusterAttacks = [
      { targetX: 1, targetY: 1, fromX: 0, fromY: 0, musterTileKey: "0,0" },
      { targetX: 2, targetY: 2, fromX: 0, fromY: 0, musterTileKey: "0,0" }
    ];
    const sendGameMessage = vi.fn(() => true);

    cancelOngoingCapture(state, sendGameMessage);

    expect(state.pendingMusterAttacks).toEqual([{ targetX: 1, targetY: 1, fromX: 0, fromY: 0, musterTileKey: "0,0" }]);
    // Purely local — nothing was ever sent to the server for a parked attack.
    expect(sendGameMessage).not.toHaveBeenCalled();
  });

  it("falls through to the normal in-flight cancel path once an attack has actually fired", () => {
    const state = createInitialState();
    state.pendingMusterAttacks = [{ targetX: 1, targetY: 1, fromX: 0, fromY: 0, musterTileKey: "0,0" }];
    state.capture = { startAt: 0, resolvesAt: 30_000, target: { x: 1, y: 1 } };
    const sendGameMessage = vi.fn(() => true);

    cancelOngoingCapture(state, sendGameMessage);

    // A different, still-parked attack is untouched by cancelling the active one.
    expect(state.pendingMusterAttacks).toEqual([{ targetX: 1, targetY: 1, fromX: 0, fromY: 0, musterTileKey: "0,0" }]);
    expect(sendGameMessage).toHaveBeenCalledWith({ type: "CANCEL_CAPTURE" });
  });
});
