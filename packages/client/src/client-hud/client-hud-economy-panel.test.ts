// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { bindHudEconomyPanelControls } from "./client-hud-economy-panel.js";

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
