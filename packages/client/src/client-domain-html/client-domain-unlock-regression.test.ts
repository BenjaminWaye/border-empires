import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { chooseDomainFromUi } from "../client-player-actions.js";
import type { DomainInfo } from "../client-types.js";

const domain = (overrides: Partial<DomainInfo> & Pick<DomainInfo, "id" | "name">): DomainInfo => ({
  tier: 1,
  description: "",
  requiresTechId: "toolmaking",
  mods: {},
  effects: {},
  requirements: { gold: 0, resources: {}, canResearch: true },
  ...overrides
});

const chooseDeps = (state: ReturnType<typeof createInitialState>, send = vi.fn(), pushFeed = vi.fn(), renderHud = vi.fn()) => ({
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

describe("domain unlock UI", () => {
  it("sends CHOOSE_DOMAIN and marks the choice as pending immediately", () => {
    const send = vi.fn();
    const pushFeed = vi.fn();
    const renderHud = vi.fn();
    const state = createInitialState();
    state.domainChoices = ["sharding"];
    state.domainCatalog = [domain({ id: "sharding", name: "Sharding" })];
    state.authSessionReady = true;

    chooseDomainFromUi("sharding", chooseDeps(state, send, pushFeed, renderHud));

    expect(send).toHaveBeenCalledWith(JSON.stringify({ type: "CHOOSE_DOMAIN", domainId: "sharding" }));
    expect(state.domainUiSelectedId).toBe("sharding");
    expect(state.pendingDomainUnlockId).toBe("sharding");
    expect(pushFeed).toHaveBeenCalledWith("Choosing domain: Sharding.", "tech", "info");
    expect(renderHud).toHaveBeenCalled();
  });

  it("does not send CHOOSE_DOMAIN for an already-owned domain detail button", () => {
    const send = vi.fn();
    const pushFeed = vi.fn();
    const state = createInitialState();
    state.domainIds = ["sharding"];
    state.domainChoices = ["next-tier"];
    state.domainCatalog = [domain({ id: "sharding", name: "Sharding" })];
    state.authSessionReady = true;

    chooseDomainFromUi("sharding", chooseDeps(state, send, pushFeed));

    expect(send).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Sharding is already chosen.", "tech", "warn");
    expect(state.pendingDomainUnlockId).toBe("");
  });

  it("does not send CHOOSE_DOMAIN for a stale selected domain outside the open tier", () => {
    const send = vi.fn();
    const pushFeed = vi.fn();
    const state = createInitialState();
    state.domainChoices = ["cogwork-foundries"];
    state.domainCatalog = [domain({ id: "frontier-doctrine", name: "Frontier Doctrine" })];
    state.authSessionReady = true;

    chooseDomainFromUi("frontier-doctrine", chooseDeps(state, send, pushFeed));

    expect(send).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("That domain tier is not available right now.", "tech", "warn");
    expect(state.pendingDomainUnlockId).toBe("");
  });

  it("does not send CHOOSE_DOMAIN when live requirements are not met", () => {
    const send = vi.fn();
    const pushFeed = vi.fn();
    const state = createInitialState();
    state.domainChoices = ["cogwork-foundries"];
    state.domainCatalog = [
      domain({
        id: "cogwork-foundries",
        name: "Cogwork Foundries",
        tier: 2,
        requiresTechId: "logistics",
        requirements: { gold: 14000, resources: { SHARD: 1 }, canResearch: false }
      })
    ];
    state.authSessionReady = true;

    chooseDomainFromUi("cogwork-foundries", chooseDeps(state, send, pushFeed));

    expect(send).not.toHaveBeenCalled();
    expect(pushFeed).toHaveBeenCalledWith("Domain requirements are not met yet.", "tech", "warn");
    expect(state.pendingDomainUnlockId).toBe("");
  });
});
