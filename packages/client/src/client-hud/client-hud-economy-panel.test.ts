// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { bindHudEconomyPanelControls, hudEconomyPanelHtml } from "./client-hud-economy-panel.js";

it("finds the nearest discovered deposit and skips undiscovered deposits", () => {
  const state = createInitialState();
  state.camX = 5;
  state.camY = 10;
  for (const x of [6, 8, 12]) {
    state.tiles.set(`${x},10`, { x, y: 10, terrain: "LAND", resource: "TITANIUM" });
  }
  state.discoveredTiles.add("8,10");
  state.discoveredTiles.add("12,10");
  const button = document.createElement("button");
  button.dataset.economyLens = "TITANIUM";
  const root = document.createElement("div");
  root.append(button);
  const deps = { wrapX: (x: number) => x, wrapY: (y: number) => y, rerender: vi.fn(), noDepositFound: vi.fn(), requestViewRefresh: vi.fn() };
  bindHudEconomyPanelControls(root, state, deps);
  button.click();
  expect(state.selected).toEqual({ x: 8, y: 10 });
  expect(state.showResourceOverlay).toBe(true);
  expect(deps.requestViewRefresh).toHaveBeenCalledOnce();
  expect(deps.noDepositFound).not.toHaveBeenCalled();
});

const deps = {
  prettyToken: (token: string) => token,
  resourceIconHtml: () => "",
  rateToneClass: () => "",
  resourceLabel: (resource: string) => resource,
  economicStructureName: (type: string) => type,
  hasRevealedResourceCategory: () => true
};

it("shows a live import, its deadline and the shortage it would leave", () => {
  const state = createInitialState();
  const now = Date.now();
  const expiresAt = now + 3 * 86_400_000;
  state.me = "me";
  state.playerNames.set("partner", "Mira");
  state.resourceSlots.supply.TITANIUM = 5;
  state.resourceSlots.demand.TITANIUM = 4;
  const agreement = {
    id: "live", proposerId: "partner", targetId: "me", proposerGives: { TITANIUM: 2 },
    targetGives: { FOOD: 1 }, targetCoinPerHour: 50, startedAt: now - 1000, expiresAt, fulfilled: true
  };
  state.resourceTradeAgreements = [agreement, { ...agreement, id: "expired", expiresAt: now - 1 }];
  const host = document.createElement("div");
  host.innerHTML = hudEconomyPanelHtml(state, deps);
  const commitments = host.querySelector('[aria-label="Trade commitments"]');
  expect(commitments?.querySelectorAll("article")).toHaveLength(1);
  expect(commitments?.querySelector("time")?.dateTime).toBe(new Date(expiresAt).toISOString());
  expect(commitments?.querySelector("button")?.dataset.proposePlayerId).toBe("partner");
  expect(commitments?.textContent).toContain("Mira");
  expect(commitments?.textContent).toContain("+2 Titanium");
  expect(commitments?.textContent).toContain("1 slot short when this deal ends");
  expect(commitments?.textContent).toContain("−1 FOOD");
  expect(commitments?.textContent).toContain("Up to −50 Coin/hour");
});
