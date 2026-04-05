import { describe, expect, it, vi } from "vitest";
import { chooseTechFromUi } from "./client-player-actions.js";

describe("tech unlock UI", () => {
  it("sends CHOOSE_TECH even when the websocket mock does not expose instance OPEN", () => {
    const send = vi.fn();
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    const state = {
      techUiSelectedId: "",
      techChoices: ["coinage"],
      techCatalog: [{ id: "coinage", name: "Coinage" }],
      authSessionReady: true,
      pendingTechUnlockId: ""
    } as any;

    chooseTechFromUi("coinage", {
      state,
      techPickEl: { value: "" } as HTMLSelectElement,
      mobileTechPickEl: { value: "" } as HTMLSelectElement,
      ws: { readyState: 1, send } as unknown as WebSocket,
      wsUrl: "ws://example.test/game",
      setAuthStatus: vi.fn(),
      syncAuthOverlay: vi.fn(),
      pushFeed,
      renderHud,
      sendGameMessage: vi.fn()
    });

    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "CHOOSE_TECH", techId: "coinage" }));
    expect(state.techUiSelectedId).toBe("coinage");
    expect(state.pendingTechUnlockId).toBe("coinage");
    expect(pushFeed).toHaveBeenCalledWith("Unlocking: Coinage.", "tech", "info");
    expect(renderHud).toHaveBeenCalled();
  });
});
