// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { screen, SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { crestClosesProfile } from "./client-hud-v2-profile.js";
import { closeScreen, openScreen, screenClick } from "./client-hud-v2-screens.js";

const depsFor = (state: ReturnType<typeof createInitialState>): HudV2Deps =>
  ({
    state,
    ownerColor: () => "#888",
    sendGameMessage: () => true,
    renderHud: () => undefined,
    requestViewRefresh: () => undefined,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    isMobile: () => false,
    actionFlow: { hideTileActionMenu: () => undefined }
  }) as unknown as HudV2Deps;

describe("profile return", () => {
  afterEach(() => {
    if (screen.id) closeScreen(depsFor(createInitialState()), { toMap: true });
    document.body.innerHTML = "";
  });

  // Regression: a profile opened from Ranks closed back to the map instead of Ranks.
  it("closes back to the screen it was opened from", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    const deps = depsFor(state);
    openScreen(deps, "ranks");
    state.activePlayerProfileId = "p2";
    openScreen(deps, "profile");
    expect(document.getElementById("v2s-back-label")?.textContent).toBe("The Duke's Seat");
    screenClick(deps, document.querySelector("[data-v2-close]") as Element);
    expect(screen.id).toBe("ranks");
    expect(state.activePlayerProfileId).toBeUndefined();
  });

  it("closes to the map when opened from the map, and when told to", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    const deps = depsFor(state);
    state.activePlayerProfileId = "p2";
    openScreen(deps, "profile");
    closeScreen(deps);
    expect(screen.id).toBeNull();
    openScreen(deps, "ranks");
    state.activePlayerProfileId = "p2";
    openScreen(deps, "profile");
    closeScreen(deps, { toMap: true });
    expect(screen.id).toBeNull();
  });

  // Regression: a second press on your crest left your profile open instead of closing it.
  it("closes your profile on a second press of your crest, like a lit bubble", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    const deps = depsFor(state);
    expect(crestClosesProfile(state.activePlayerProfileId, state.me, screen.id)).toBe(false);
    state.activePlayerProfileId = "p1";
    openScreen(deps, "profile");
    expect(crestClosesProfile(state.activePlayerProfileId, state.me, screen.id)).toBe(true);
    closeScreen(deps);
    expect(screen.id).toBeNull();
    expect(state.activePlayerProfileId).toBeUndefined();
  });

  it("switches to your profile instead of closing when the crest is pressed on someone else's", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    state.activePlayerProfileId = "p2";
    openScreen(depsFor(state), "profile");
    expect(crestClosesProfile(state.activePlayerProfileId, state.me, screen.id)).toBe(false);
  });
});
