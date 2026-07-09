import { describe, expect, it, vi } from "vitest";
import { buildFortOnSelected, buildSiegeOutpostOnSelected } from "./client-selected-actions.js";

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
