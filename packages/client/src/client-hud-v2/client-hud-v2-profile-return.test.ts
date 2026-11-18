// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import { screen, SCREEN_HOST_ID, type HudV2Deps } from "./client-hud-v2-context.js";
import { crestClosesProfile } from "./client-hud-v2-profile.js";
import { closeProfileFromCrest, closeScreen, openScreen, screenClick } from "./client-hud-v2-screens.js";

const depsFor = (state: ReturnType<typeof createInitialState>): HudV2Deps =>
  ({
    state,
    ownerColor: () => "#888",
    sendGameMessage: () => true,
    renderHud: () => undefined,
    requestViewRefresh: () => undefined,
    wrapX: (x: number) => x,
    wrapY: (y: number) => y,
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

  it("treats your own profile as a peer tab and closes directly to the map", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    const deps = depsFor(state);
    openScreen(deps, "diplomacy");
    state.activePlayerProfileId = "p1";
    openScreen(deps, "profile");
    expect(document.getElementById("v2s-back-label")?.textContent).toBe("Map");
    screenClick(deps, document.querySelector("[data-v2-close]") as Element);
    expect(screen.id).toBeNull();
    expect(state.activePlayerProfileId).toBeUndefined();
  });

  // Regression: a profile opened from a deal's header closed back to the empire list, losing the deal.
  it("closes back to the deal it was opened from", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    state.playerNames.set("p2", "Rival");
    const deps = depsFor(state);
    openScreen(deps, "diplomacy", { diplomacyTarget: "p2" });
    const link = document.querySelector<HTMLElement>(".v2d-deal-profile-link");
    expect(link?.dataset.hudV2Profile).toBe("p2");
    state.activePlayerProfileId = "p2";
    openScreen(deps, "profile");
    expect(document.getElementById("v2s-back-label")?.textContent).toBe("Diplomacy");
    screenClick(deps, document.querySelector("[data-v2-close]") as Element);
    expect(screen.id).toBe("diplomacy");
    expect(screen.diplomacyTargetId).toBe("p2");
    expect(document.querySelector(".v2d-deal-with")?.textContent).toBe("Rival");
  });

  // Regression: a counter-offer deal's profile link reopened it as a plain new offer, dropping the counter.
  it("offers no profile link on a counter-offer deal", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    state.playerNames.set("p2", "Rival");
    state.incomingTruceRequests = [{ id: "r1", fromPlayerId: "p2", toPlayerId: "p1", fromName: "Rival", durationHours: 12, createdAt: 0, expiresAt: Date.now() + 60_000 } as never];
    const deps = depsFor(state);
    openScreen(deps, "diplomacy");
    screenClick(deps, document.querySelector("[data-v2-dip-counter]") as Element);
    expect(document.querySelector(".v2d-deal-with")?.textContent).toBe("Rival");
    expect(document.querySelector("[data-hud-v2-profile]")).toBeNull();
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

  // Regression: pressing your crest with the profile open over the Manifest fell back to the Manifest.
  it("leaves no Manifest behind when the crest closes a profile opened over it", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    const deps = depsFor(state);
    openScreen(deps, "manifest");
    state.activePlayerProfileId = "p1";
    openScreen(deps, "profile");
    expect(closeProfileFromCrest(deps)).toBe(true);
    expect(screen.id).toBeNull();
    expect(state.activePlayerProfileId).toBeUndefined();
  });

  it("does not close from the crest when the open profile is someone else's", () => {
    document.body.innerHTML = `<div id="${SCREEN_HOST_ID}"></div>`;
    const state = createInitialState();
    state.me = "p1";
    const deps = depsFor(state);
    openScreen(deps, "manifest");
    state.activePlayerProfileId = "p2";
    openScreen(deps, "profile");
    expect(closeProfileFromCrest(deps)).toBe(false);
    expect(screen.id).toBe("profile");
  });
});
