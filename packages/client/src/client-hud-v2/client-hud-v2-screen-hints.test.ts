// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { chronicleHeadHtml } from "./client-hud-v2-chronicle.js";
import { screen, SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { SCREEN_HINTS } from "./client-hud-v2-hints.js";
import { closeScreen, openScreen } from "./client-hud-v2-screens.js";

const depsFor = (state: ReturnType<typeof createInitialState>): HudV2Deps =>
  ({
    state,
    ownerColor: () => "#888",
    sendGameMessage: () => true,
    renderHud: () => undefined,
    setActivePanel: () => undefined,
    requestViewRefresh: () => undefined,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
    actionFlow: { hideTileActionMenu: () => undefined }
  }) as unknown as HudV2Deps;

// Owner 2026-11-18: "Hover titles doesn't work on phone". Each screen a nav tab or the crest opens says
// what it is for in visible text under its title.
describe("screen explanation lines", () => {
  afterEach(() => {
    if (screen.id) closeScreen(depsFor(createInitialState()), { toMap: true });
    document.body.innerHTML = "";
  });

  it.each(["manifest", "towns", "afc", "diplomacy", "ranks"] as const)("shows the %s line under the title", (id) => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    openScreen(depsFor(createInitialState()), id);
    const hint = document.getElementById("v2s-hint");
    expect(hint?.textContent).toBe(SCREEN_HINTS[id]);
    expect(hint?.textContent).not.toBe("");
  });

  it("shows the profile line on your own profile (the crest) only", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    state.activePlayerProfileId = "p1";
    openScreen(depsFor(state), "profile");
    expect(document.getElementById("v2s-hint")?.textContent).toBe("Stats · House Charges");
    closeScreen(depsFor(state), { toMap: true });
    state.activePlayerProfileId = "p2";
    openScreen(depsFor(state), "profile");
    expect(document.getElementById("v2s-hint")?.textContent).toBe("");
  });

  it("shows the Chronicle line in its head", () => {
    expect(chronicleHeadHtml()).toContain(`<span class="v2s-hint">${SCREEN_HINTS.chronicle}</span>`);
  });
});
