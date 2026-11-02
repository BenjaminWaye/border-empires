// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { refreshOnboardingChecklistHighlight, tickOnboardingUiGateForFrame } from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { noteGuideMapPanned, resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { readGuideProgress, resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";

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
    click("skip");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Tap the marked town and Expand To it");
    expect(state.onboardingHighlightTiles).toEqual([{ x: 2, y: 0 }]);
    expect(card()?.querySelector('[data-guide-action="show-me"]')).not.toBeNull();
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
    chip.className = "stat-chip stat-chip-manpower";
    chip.getBoundingClientRect = () => ({ left: 100, top: 10, width: 80, height: 30, right: 180, bottom: 40, x: 100, y: 10, toJSON: () => ({}) }) as DOMRect;
    document.body.appendChild(chip);
    setGuideStatus("active", EMAIL);
    noteGuideMapPanned();
    refreshOnboardingChecklistHighlight(state);
    click("skip"); // zoom
    click("skip"); // select
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardTitle()).toBe("Tap your manpower gauge");
    const outline = document.getElementById("tutorial-guide-anchor-outline");
    expect(outline?.style.left).toBe("96px");
    const css = Array.from(document.head.querySelectorAll("style")).map((s) => s.textContent).join("\n");
    expect(css).toMatch(/#tutorial-guide-anchor-outline \{[^}]*pointer-events: none/);
  });

  it("Hide guide turns it off for good and removes the card", () => {
    setGuideStatus("active", EMAIL);
    const state = newPlayerState();
    refreshOnboardingChecklistHighlight(state);
    click("hide");
    expect(card()).toBeNull();
    expect(readGuideProgress(EMAIL).status).toBe("dismissed");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()).toBeNull();
    refreshOnboardingChecklistHighlight(state);
    expect(checklistBubble()).toBeNull(); // no fallback to the checklist bubble
  });
});
