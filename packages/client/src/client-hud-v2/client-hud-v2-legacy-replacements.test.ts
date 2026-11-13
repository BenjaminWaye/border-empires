// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { installHudV2 } from "./client-hud-v2.js";
import { clearScreen, type HudV2Deps } from "./client-hud-v2-context.js";

afterEach(() => { vi.useRealTimers(); clearScreen(); document.body.innerHTML = ""; });

it("replaces the legacy HUD controls: profile crest and side panels", () => {
  vi.useFakeTimers();
  document.body.innerHTML = '<div id="hud"></div>';
  const state = createInitialState();
  state.me = "me";
  state.authSessionReady = true;
  state.hasEverInitialized = true;
  state.firstChunkAt = 1;
  const sendGameMessage = vi.fn().mockReturnValue(true);
  const deps: HudV2Deps = {
    state, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: x => x, wrapY: y => y,
    setActivePanel: vi.fn(), sendGameMessage, ownerColor: () => "#888",
    actionFlow: { chooseTech: vi.fn(), cancelOngoingCapture: vi.fn(), handleTileAction: vi.fn(), hideTileActionMenu: vi.fn(),
      requestTileDetailIfNeeded: vi.fn(), tileMenuViewForTile: vi.fn(), openSingleTileActionMenu: vi.fn() }
  };
  installHudV2(deps);
  expect(document.body.classList.contains("hud-v2")).toBe(true);

  // Regression: the crest opened your profile by clicking the hidden legacy player chip, which only carried
  // your id once the leaderboard had arrived.
  document.querySelector<HTMLButtonElement>('[data-hud-v2-open="self"]')!.click();
  expect(state.activePlayerProfileId).toBe("me");

  // Side panels open directly rather than through the removed top-strip buttons.
  document.querySelector<HTMLButtonElement>('[data-hud-v2-open="settings"]')!.click();
  expect(deps.setActivePanel).toHaveBeenCalledWith("settings");
});
