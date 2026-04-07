import { describe, expect, it, vi } from "vitest";
import { chooseDomainFromUi } from "./client-player-actions.js";

describe("domain unlock UI", () => {
  it("sends CHOOSE_DOMAIN and marks the choice as pending immediately", () => {
    const send = vi.fn();
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    const state = {
      domainUiSelectedId: "",
      domainChoices: ["sharding"],
      domainCatalog: [{ id: "sharding", name: "Sharding" }],
      authSessionReady: true,
      pendingDomainUnlockId: ""
    } as any;

    chooseDomainFromUi("sharding", {
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

    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "CHOOSE_DOMAIN", domainId: "sharding" }));
    expect(state.domainUiSelectedId).toBe("sharding");
    expect(state.pendingDomainUnlockId).toBe("sharding");
    expect(pushFeed).toHaveBeenCalledWith("Choosing domain: Sharding.", "tech", "info");
    expect(renderHud).toHaveBeenCalled();
  });
});
