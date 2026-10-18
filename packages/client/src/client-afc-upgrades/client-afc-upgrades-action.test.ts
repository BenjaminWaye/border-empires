// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { chooseDomainFromUi, type PlayerActionDeps } from "../client-player-actions.js";
import { renderAfcUpgradePanels } from "./client-afc-upgrades.js";

function setup(): PlayerActionDeps {
  const state = createInitialState();
  state.me = "me"; state.authSessionReady = true; state.techIds = ["trade"];
  state.gold = 40; state.strategicResources.SHARD = 1;
  state.domainCatalog = [{ id: "upgrade", tier: 1, name: "Upgrade", description: "Description", mods: {},
    requiresTechId: "trade", requirements: { gold: 40, resources: { SHARD: 1 }, canResearch: false } }];
  state.domainChoices = ["upgrade"];
  return { state, techPickEl: document.createElement("select"), mobileTechPickEl: document.createElement("select"),
    ws: { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3, readyState: 1, send: vi.fn(),
      close: vi.fn(), reconnect: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn() },
    wsUrl: "ws://localhost", setAuthStatus: vi.fn(), syncAuthOverlay: vi.fn(), pushFeed: vi.fn(), renderHud: vi.fn(),
    sendGameMessage: vi.fn() };
}

describe("AFC upgrade installation uses the same live eligibility as its badge", () => {
  it("submits once from the inline panel after earning resources since INIT", () => {
    const deps = setup();
    const desktop = document.createElement("div"), mobile = document.createElement("div");
    const render = () => renderAfcUpgradePanels(deps.state, desktop, mobile, id => chooseDomainFromUi(id, deps));
    deps.renderHud = render;
    render();
    mobile.querySelector<HTMLButtonElement>("[data-afc-upgrade-card]")!.click();
    mobile.querySelector<HTMLButtonElement>("[data-domain-unlock]")!.click();
    mobile.querySelector<HTMLButtonElement>("[data-domain-unlock]")!.click();
    expect(deps.ws.send).toHaveBeenCalledTimes(1);
    expect(deps.ws.send).toHaveBeenCalledWith(JSON.stringify({ type: "CHOOSE_DOMAIN", domainId: "upgrade" }));
    expect(deps.state.pendingDomainUnlockId).toBe("upgrade");
    expect(deps.state.domainIds).toEqual([]);
  });
  it("does not trust an affordable INIT stamp after spending its resources", () => {
    const deps = setup();
    deps.state.domainCatalog[0]!.requirements.canResearch = true;
    deps.state.gold = 39;
    chooseDomainFromUi("upgrade", deps);
    expect(deps.ws.send).not.toHaveBeenCalled();
    deps.state.gold = 40; deps.state.techIds = [];
    chooseDomainFromUi("upgrade", deps);
    expect(deps.ws.send).not.toHaveBeenCalled();
  });
});
