// @vitest-environment happy-dom
// Playtest 2026-11-27 (snacker): an "Action failed" alert showed half hidden under the guide card, and the
// card came back over it after every popup closed. The alert sits inside #hud (its own stacking context), so
// the body-level card always painted over it; the card now steps aside while an alert is up.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { refreshOnboardingChecklistHighlight, resetOnboardingUiOverlaysForTests, tickOnboardingUiGateForFrame } from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { noteGuideMapPanned, resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";

const ME = "p1";
const EMAIL = "new@example.com";

const footholdDoneState = () => {
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
  const tiles: Array<Partial<Tile> & { x: number; y: number }> = [
    { x: 0, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never },
    { x: 2, y: 0, ownerId: ME, ownershipState: "SETTLED", town: { type: "MARKET", populationTier: "TOWN" } as never },
    { x: 1, y: 0, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" },
    { x: 1, y: 1, ownerId: ME, ownershipState: "SETTLED", resource: "FISH" }
  ];
  for (const t of tiles) state.tiles.set(tileKey(t.x, t.y), { terrain: "LAND", ...t } as Tile);
  state.tilesRevision += 1;
  return state;
};

const card = () => document.getElementById("tutorial-guide-root");
const click = (action: string) => (card()?.querySelector(`[data-guide-action="${action}"]`) as HTMLElement | null)?.click();
const styles = () => Array.from(document.head.querySelectorAll("style")).map((s) => s.textContent).join("\n");

/** Starts the guide and skips to the step `skips` steps after Look around's first. */
const startAt = (state: ReturnType<typeof footholdDoneState>, skips: number): void => {
  setGuideStatus("active", EMAIL);
  noteGuideMapPanned();
  refreshOnboardingChecklistHighlight(state);
  for (let i = 0; i < skips; i += 1) click("skip");
  tickOnboardingUiGateForFrame(state, vi.fn());
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  document.body.className = "";
  document.head.innerHTML = "";
  resetGuideStorageMemoryForTests();
  resetGuideInputSignalsForTests();
  resetGuideInputCacheForTests();
  resetTutorialGuideForTests();
  resetOnboardingChecklistOverlayForTests();
  resetOnboardingUiOverlaysForTests();
});

describe("tutorial guide and alerts", () => {
  it("steps aside while an alert is up and only comes back once it closes", () => {
    const state = footholdDoneState();
    const alert = document.createElement("div");
    alert.id = "capture-card";
    alert.style.display = "none";
    document.body.appendChild(alert);
    startAt(state, 2);
    expect(card()?.classList.contains("tg-yield-alert")).toBe(false);

    alert.dataset.state = "warn";
    alert.style.display = "grid";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-yield-alert")).toBe(true);
    expect(styles()).toContain("#tutorial-guide-root.tg-yield-alert > * { visibility: hidden !important; pointer-events: none !important; }");

    // A capture in progress (no alert tone) is not an alert: the card stays.
    delete alert.dataset.state;
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-yield-alert")).toBe(false);

    alert.dataset.state = "error";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-yield-alert")).toBe(true);
    alert.style.display = "none";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.classList.contains("tg-yield-alert")).toBe(false);
  });

  it("folds to its launcher when an alert closes instead of popping back over the map", () => {
    const state = footholdDoneState();
    const alert = document.createElement("div");
    alert.id = "capture-card";
    alert.style.display = "none";
    document.body.appendChild(alert);
    startAt(state, 2);
    const cardShown = (): boolean => !(card()?.querySelector(".tg-card") as HTMLElement | null)?.hidden;
    expect(cardShown()).toBe(true);
    const stepBefore = card()?.querySelector(".tg-title")?.textContent;

    alert.dataset.state = "error";
    alert.style.display = "grid";
    tickOnboardingUiGateForFrame(state, vi.fn());
    alert.style.display = "none";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardShown()).toBe(false);
    expect(card()?.querySelector(".tg-launcher")?.hasAttribute("hidden")).toBe(false);

    // Later alerts leave it folded; the next step unfolds it.
    alert.style.display = "grid";
    tickOnboardingUiGateForFrame(state, vi.fn());
    alert.style.display = "none";
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(cardShown()).toBe(false);
    click("toggle");
    expect(cardShown()).toBe(true);
    click("skip");
    tickOnboardingUiGateForFrame(state, vi.fn());
    expect(card()?.querySelector(".tg-title")?.textContent).not.toBe(stepBefore);
    expect(cardShown()).toBe(true);
  });
});
