// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { refreshOnboardingChecklistHighlight, tickOnboardingUiGateForFrame } from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { noteGuideMapPanned, resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { markGuideStepsCompleted, readGuideProgress, resetGuideStorageMemoryForTests, restartGuide, setGuideStatus } from "./tutorial-guide-storage.js";
import { GUIDE_STEPS } from "./tutorial-guide-steps.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";
import { setGuestIdentityUid } from "../client-debug/client-debug.js";

const ME = "p1";
const EMAIL = "new@example.com";

const setTiles = (state: ReturnType<typeof createInitialState>, tiles: Array<Partial<Tile> & { x: number; y: number }>): void => {
  for (const t of tiles) state.tiles.set(tileKey(t.x, t.y), { terrain: "LAND", ...t } as Tile);
  state.tilesRevision += 1;
};

/** A just-landed player: own starting settlement with a neutral town in reach, map clear of dialogs. */
const newPlayerState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  state.me = ME;
  state.authEmail = EMAIL;
  state.firstChunkAt = 1;
  setTiles(state, [
    { x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never },
    { x: 2, y: 0, town: { type: "MARKET", populationTier: "TOWN" } as never }
  ]);
  return state;
};

const card = () => document.getElementById("tutorial-guide-root");
const cardTitle = () => card()?.querySelector(".tg-title")?.textContent ?? "";
const checklistBubble = () => document.getElementById("onboarding-checklist-bubble");
const click = (action: string) => (card()?.querySelector(`[data-guide-action="${action}"]`) as HTMLElement | null)?.click();

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  document.head.innerHTML = "";
  resetGuideStorageMemoryForTests();
  resetGuideInputSignalsForTests();
  resetGuideInputCacheForTests();
  resetTutorialGuideForTests();
  resetOnboardingChecklistOverlayForTests();
});

describe("tutorial guide in the onboarding corner", () => {
  it("leaves accounts without the guide on the New empire checklist", () => {
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    expect(checklistBubble()).not.toBeNull();
    expect(card()).toBeNull();
  });

  it("replaces the checklist for an enrolled account, starting on Look around", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    expect(checklistBubble()).toBeNull();
    expect(cardTitle()).toBe("Drag the map to look around");
  });

  it("never blocks the map: no scrim, and only the card and launcher take pointer events", () => {
    setGuideStatus("active", EMAIL);
    refreshOnboardingChecklistHighlight(newPlayerState());
    const css = Array.from(document.head.querySelectorAll("style")).map((s) => s.textContent).join("\n");
    expect(css).toMatch(/#tutorial-guide-root \{[^}]*pointer-events: none/);
    expect(css).toMatch(/#tutorial-guide-root \.tg-card, #tutorial-guide-root \.tg-launcher \{ pointer-events: auto; \}/);
    expect(document.body.children).toHaveLength(1); // just the guide root: nothing covering the screen
  });

  it("advances when the player pans the map themselves, on the next frame", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    noteGuideMapPanned();
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Zoom in and out (scroll or pinch)");
    expect(readGuideProgress(EMAIL).steps).toContain("look-pan");
  });

  it("feeds the step's map target into the shared highlight list both renderers draw, and Show me centres on it", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    click("skip");
    click("skip");
    click("skip"); // explore
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Tap the marked town, then Expand To");
    expect(state.onboardingHighlightTiles).toEqual([{ x: 2, y: 0 }]);
    expect(card()?.querySelector('[data-guide-action="show-me"]')).not.toBeNull();
  });

  it("tells the player to Garrison a town their reach already claimed, ringing that town", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    setTiles(state, [{ x: 2, y: 0, ownerId: ME, ownershipState: "FRONTIER", town: { type: "MARKET", populationTier: "TOWN" } as never }]);
    refreshOnboardingChecklistHighlight(state);
    click("skip");
    click("skip");
    click("skip"); // explore
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Tap the marked town, then Garrison");
    expect(state.onboardingHighlightTiles).toEqual([{ x: 2, y: 0 }]);
  });

  it("shows the grain and fish icons to look for on the food steps", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    setTiles(state, [{ x: 2, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } as never }]);
    noteGuideMapPanned();
    refreshOnboardingChecklistHighlight(state);
    click("skip"); // zoom
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toMatch(/^No food nearby: build a Relay Beacon/); // no grain or fish on this tiny test map
    const icons = Array.from(card()?.querySelectorAll(".tg-lookfor img") ?? []);
    expect(icons).toHaveLength(2);
    // The visible "Grain" / "Fish" label names each icon, so the image is decorative to screen readers.
    expect(icons.every((img) => img.closest('[aria-hidden="true"]'))).toBe(true);
    expect(card()?.querySelector(".tg-lookfor")?.textContent).toContain("Grain");
  });

  it("with no town in sight, asks for a scout drone flight to find one (no instruction-less 'Find a town' step)", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    state.tiles.delete("2,0"); // the only town
    state.tilesRevision += 1;
    state.homeTile = { x: 0, y: 0 }; // nothing discovered yet: unexplored ground all around
    noteGuideMapPanned();
    refreshOnboardingChecklistHighlight(state);
    click("skip"); // zoom
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Tap the marked unexplored ground, then Explore and Go");
    click("skip"); // explore
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("No town nearby: tap the marked ground, then Explore and Go");
    expect(state.onboardingHighlightTiles).toHaveLength(1);
  });

  it("with no town in sight and no AFC to launch a drone, asks for a Relay Beacon", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    state.tiles.delete("2,0"); // the only town
    state.tilesRevision += 1;
    state.afcRecovery = { requiredSince: 1 } as never;
    noteGuideMapPanned();
    refreshOnboardingChecklistHighlight(state);
    click("skip"); // zoom
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toMatch(/^No town nearby: build a Relay Beacon/);
  });

  it("hides while a dialog covers the map, then comes back", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    state.changelog.open = true;
    refreshOnboardingChecklistHighlight(state);
    expect(card()).toBeNull();
    expect(state.onboardingHighlightTiles).toEqual([]);
    state.changelog.open = false;
    tickOnboardingUiGateForFrame(state, vi.fn());
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()).not.toBeNull();
  });

  it("outlines the HUD button for a panel step without covering it", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    setTiles(state, [
      { x: 2, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } as never },
      { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" },
      { x: 1, y: 1, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" }
    ]);
    const chip = document.createElement("button");
    chip.dataset.hudV2Open = "manpower";
    chip.getBoundingClientRect = () => ({ left: 100, top: 10, width: 80, height: 30, right: 180, bottom: 40, x: 100, y: 10, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(chip);
    setGuideStatus("active", EMAIL);
    noteGuideMapPanned();
    refreshOnboardingChecklistHighlight(state);
    click("skip"); // zoom
    click("skip"); // relay beacon
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Tap your manpower gauge");
    const outline = document.getElementById("tutorial-guide-anchor-outline");
    expect(outline?.style.left).toBe("96px");
    const css = Array.from(document.head.querySelectorAll("style")).map((s) => s.textContent).join("\n");
    expect(css).toMatch(/#tutorial-guide-anchor-outline \{[^}]*pointer-events: none/);
  });

  it("counts the new desktop HUD's Manifest screen as opening Manifests and outlines its Manifest button", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    setTiles(state, [
      { x: 2, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } as never },
      { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" },
      { x: 1, y: 1, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" }
    ]);
    document.body.classList.add("hud-v2");
    const bubble = document.createElement("button");
    bubble.setAttribute("data-hud-v2-open", "manifest");
    bubble.getBoundingClientRect = () => ({ left: 300, top: 600, width: 40, height: 40, right: 340, bottom: 640, x: 300, y: 600, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(bubble);
    noteGuideMapPanned();
    refreshOnboardingChecklistHighlight(state);
    click("skip"); // zoom
    click("skip"); // relay beacon
    click("skip"); // manpower
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Open Manifests");
    expect(document.getElementById("tutorial-guide-anchor-outline")?.style.left).toBe("296px");
    expect(card()?.classList.contains("onb-root")).toBe(true); // picks up HUD v2's corner placement and screen hiding
    document.body.classList.add("hud-v2-screen-manifest");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Commission the Industrial Tooling Module");
    document.body.className = "";
  });

  it("clears the map rings on the next frame after Skip guide", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    click("skip");
    click("skip");
    click("skip"); // explore
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(state.onboardingHighlightTiles).toEqual([{ x: 2, y: 0 }]);
    click("hide");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(state.onboardingHighlightTiles).toEqual([]);
  });

  it("does not carry one account's input signals over to the next sign-in", () => {
    setGuideStatus("active", EMAIL);
    setGuideStatus("active", "second@example.com");
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    noteGuideMapPanned();
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Zoom in and out (scroll or pinch)");
    state.authEmail = "second@example.com";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Drag the map to look around");
  });

  it("treats a second guest on the same page as a different account (guests share an empty email)", () => {
    setGuestIdentityUid("guest-a");
    try {
      setGuideStatus("active", "");
      const state = newPlayerState();
      state.authEmail = "";
      refreshOnboardingChecklistHighlight(state);
      noteGuideMapPanned();
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(cardTitle()).toBe("Zoom in and out (scroll or pinch)");
      setGuestIdentityUid("guest-b");
      setGuideStatus("active", "");
      tickOnboardingUiGateForFrame(state, vi.fn());
      // Guest A's pan doesn't tick guest B's first step.
      expect(cardTitle()).toBe("Drag the map to look around");
    } finally {
      setGuestIdentityUid("");
    }
  });

  it("Finish with Contest and Diplomacy still waiting keeps them: the guide folds and comes back on first contact", () => {
    // Playtest 2026-11: Finish at 13/16 ended the guide and felt like losing the last three steps.
    setGuideStatus("active", EMAIL);
    const waitingOnly = GUIDE_STEPS.filter((s) => !["contest-muster", "diplomacy-truce", "turn-finish"].includes(s.id)).map((s) => s.id);
    markGuideStepsCompleted(waitingOnly, EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    expect(card()?.querySelector(".tg-later")?.textContent).toBe("The guide returns for: Diplomacy, First battle");
    click("finish");
    expect(readGuideProgress(EMAIL).status).toBe("active");
    expect(readGuideProgress(EMAIL).steps).toContain("turn-finish");
    // Folded to its launcher. Both steps left wait on a first contact, so it shows no count: first-15
    // playtest 2026-11-28, "4 steps left" after Finish read as if Finish had not taken.
    expect(card()?.querySelector(".tg-card")?.hasAttribute("hidden")).toBe(true);
    expect(card()?.querySelector(".tg-launcher")?.hasAttribute("hidden")).toBe(false);
    expect(card()?.querySelector(".tg-badge")).toBeNull();
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.querySelector(".tg-card")?.hasAttribute("hidden")).toBe(true); // stays folded while waiting
    // Meeting a rival House: the guide unfolds on Diplomacy by itself.
    state.tiles.set("9,9", { x: 9, y: 9, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED" } as Tile);
    state.tilesRevision += 1;
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.querySelector(".tg-card")?.hasAttribute("hidden")).toBe(false);
    expect(card()?.querySelector(".tg-chapter")?.textContent).toContain("Diplomacy");
  });

  it("ends with a full Guide complete card once the steps waiting after Finish are done", () => {
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(GUIDE_STEPS.filter((s) => s.id !== "diplomacy-truce").map((s) => s.id), EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    expect(card()?.querySelector(".tg-card")?.hasAttribute("hidden")).toBe(true); // reload after Finish: still folded
    markGuideStepsCompleted(["diplomacy-truce"], EMAIL);
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(readGuideProgress(EMAIL).status).toBe("done");
    expect(card()?.textContent).toContain("Guide complete");
    expect(card()?.querySelector(".tg-count")?.textContent).toBe(`${GUIDE_STEPS.length}/${GUIDE_STEPS.length}`);
  });

  it("Finish with every step done ends the guide at once", () => {
    setGuideStatus("active", EMAIL);
    markGuideStepsCompleted(GUIDE_STEPS.filter((s) => s.id !== "turn-finish").map((s) => s.id), EMAIL);
    refreshOnboardingChecklistHighlight(newPlayerState());
    expect(card()?.querySelector(".tg-later")).toBeNull();
    click("finish");
    expect(readGuideProgress(EMAIL).status).toBe("done");
    expect(card()?.textContent).toContain("Guide complete");
  });

  describe("after Finish (review of PR 2902)", () => {
    const folded = () => card()?.querySelector(".tg-card")?.hasAttribute("hidden") === true;
    const rival = (state: ReturnType<typeof newPlayerState>, present: boolean) => {
      if (present) state.tiles.set("9,9", { x: 9, y: 9, terrain: "LAND", ownerId: "p2", ownershipState: "SETTLED" } as Tile);
      else state.tiles.delete("9,9");
      state.tilesRevision += 1;
    };
    const finishWithContestAndDiplomacyWaiting = () => {
      setGuideStatus("active", EMAIL);
      markGuideStepsCompleted(GUIDE_STEPS.filter((s) => !["contest-muster", "diplomacy-truce", "turn-finish"].includes(s.id)).map((s) => s.id), EMAIL);
      const state = newPlayerState();
      refreshOnboardingChecklistHighlight(state);
      click("finish");
      return state;
    };

    it("folds again once Diplomacy is done while Contest still waits", () => {
      const state = finishWithContestAndDiplomacyWaiting();
      rival(state, true);
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(folded()).toBe(false);
      markGuideStepsCompleted(["diplomacy-truce"], EMAIL);
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(folded()).toBe(true);
      expect(card()?.querySelector(".tg-badge")).toBeNull();
    });

    it("doesn't flap or override the player when a rival's tiles leave the map and come back", () => {
      const state = finishWithContestAndDiplomacyWaiting();
      rival(state, true);
      tickOnboardingUiGateForFrame(state, vi.fn());
      click("toggle"); // the player folds it
      expect(folded()).toBe(true);
      rival(state, false);
      tickOnboardingUiGateForFrame(state, vi.fn());
      rival(state, true);
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(folded()).toBe(true);
    });

    it("a guide restarted without Finish (new season, Restart elsewhere) starts unfolded", () => {
      const state = finishWithContestAndDiplomacyWaiting();
      expect(folded()).toBe(true);
      restartGuide(EMAIL);
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(folded()).toBe(false);
      expect(cardTitle()).toBe("Drag the map to look around");
    });

    it("still shows Guide complete when the last step is done while a dialog hides the guide", () => {
      const state = finishWithContestAndDiplomacyWaiting();
      markGuideStepsCompleted(["contest-muster"], EMAIL);
      state.changelog.open = true;
      tickOnboardingUiGateForFrame(state, vi.fn());
      markGuideStepsCompleted(["diplomacy-truce"], EMAIL);
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(card()?.textContent ?? "").not.toContain("Guide complete");
      state.changelog.open = false;
      tickOnboardingUiGateForFrame(state, vi.fn());
      expect(readGuideProgress(EMAIL).status).toBe("done");
      expect(card()?.textContent).toContain("Guide complete");
    });
  });

  it("Skip guide is a visible button that turns it off and removes the card", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    const skipGuide = card()?.querySelector('[data-guide-action="hide"]');
    expect(skipGuide?.textContent).toBe("Skip guide");
    expect(skipGuide?.classList.contains("tg-btn")).toBe(true); // a button, not the old faint underlined link
    expect(skipGuide?.closest(".tg-card .tg-actions")).not.toBeNull(); // in the card's own action row: no new HUD element on crowded phones
    click("hide");
    expect(card()).toBeNull();
    expect(readGuideProgress(EMAIL).status).toBe("dismissed");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()).toBeNull();
    refreshOnboardingChecklistHighlight(state);
    expect(checklistBubble()).toBeNull(); // no fallback to the checklist bubble
  });
});
