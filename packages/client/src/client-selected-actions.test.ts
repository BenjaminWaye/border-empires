import { describe, expect, it, vi } from "vitest";
import { buildFortOnSelected, buildSiegeOutpostOnSelected } from "./client-selected-actions.js";

describe("selected action helpers", () => {
  it("sends fort builds with the supported gateway message", () => {
    const sendGameMessage = vi.fn(() => true);

    buildFortOnSelected(
      { selected: { x: 10, y: 11 } },
      {
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
      { selected: { x: 12, y: 13 } },
      {
        pushFeed: vi.fn(),
        renderHud: vi.fn(),
        sendGameMessage
      }
    );

    expect(sendGameMessage).toHaveBeenCalledWith({ type: "BUILD_SIEGE_OUTPOST", x: 12, y: 13 });
  });
});
