// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialState } from "../client-state/client-state.js";
import { closeDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import { SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { closeScreen, openScreen, screenClick } from "./client-hud-v2-screens.js";

const depsFor = (): HudV2Deps => {
  const state = createInitialState();
  state.me = "me";
  state.metPlayerIds = new Set(["ai-1", "ai-2"]);
  state.playerNames.set("ai-1", "Hugo");
  state.playerNames.set("ai-2", "Linnea");
  return {
    state,
    renderHud: vi.fn(),
    requestViewRefresh: vi.fn(),
    wrapX: (x) => x,
    wrapY: (y) => y,
    setActivePanel: vi.fn(),
    sendGameMessage: vi.fn().mockReturnValue(true),
    actionFlow: { hideTileActionMenu: vi.fn() } as unknown as HudV2Deps["actionFlow"],
    ownerColor: () => "#888888"
  };
};

const list = (): HTMLElement => document.querySelector<HTMLElement>("[data-v2-scroll='diplomacy']")!;

afterEach(() => {
  closeDiplomacyTradeScreen();
  document.body.innerHTML = "";
});

// Playtest 2026-11-13 (pt-diplomat): after each deal the empire list jumped
// back to the top, so every empire meant scrolling down again (~8 times).
describe("Diplomacy list scroll across a deal", () => {
  it("returns to where the list was when the deal closes", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const deps = depsFor();
    openScreen(deps, "diplomacy");
    list().scrollTop = 240;
    screenClick(deps, document.querySelector('[data-v2-dip-open="ai-2"]')!);
    expect(list()).toBeNull();
    closeDiplomacyTradeScreen();
    // The deal closes by removing its overlay; the observer re-renders the list asynchronously.
    return new Promise<void>((resolve) => setTimeout(() => {
      expect(list()).not.toBeNull();
      expect(list().scrollTop).toBe(240);
      closeScreen(deps);
      resolve();
    }, 0));
  });
});
