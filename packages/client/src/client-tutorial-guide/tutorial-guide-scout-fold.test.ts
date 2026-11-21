// @vitest-environment happy-dom
// Regression (player report 2026-11-21): during a scout drone flight the guide folds to its "?" launcher,
// but tapping "?" did nothing (the fold kept the card hidden whatever the tap did) and the "?" sat off centre.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { resetOnboardingChecklistOverlayForTests } from "../client-onboarding-checklist/client-onboarding-checklist-overlay.js";
import { refreshOnboardingChecklistHighlight } from "../client-onboarding-ui-gate/client-onboarding-ui-overlays.js";
import { resetGuideInputSignalsForTests } from "./tutorial-guide-input-signals.js";
import { resetGuideInputCacheForTests } from "./tutorial-guide-input.js";
import { resetGuideStorageMemoryForTests, setGuideStatus } from "./tutorial-guide-storage.js";
import { resetTutorialGuideForTests } from "./tutorial-guide.js";
import { clearGuideScoutPeek } from "./tutorial-guide-card.js";

const EMAIL = "new@example.com";

const playerState = () => {
  const state = createInitialState();
  state.authSessionReady = true;
  state.profileSetupRequired = false;
  state.changelog.open = false;
  state.activityDashboard.open = false;
  state.needsSeasonJoin = false;
  state.joinSeasonOverlayOpen = false;
  state.respawnOverlayOpen = false;
  state.seasonWinner = undefined;
  state.me = "p1";
  state.authEmail = EMAIL;
  state.firstChunkAt = 1;
  state.tiles.set(tileKey(0, 0), { x: 0, y: 0, terrain: "LAND", ownerId: "p1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } } as unknown as Tile);
  state.tilesRevision += 1;
  return state;
};

const root = () => document.getElementById("tutorial-guide-root")!;
const cardEl = () => root().querySelector(".tg-card")!;
const launcher = () => root().querySelector<HTMLElement>(".tg-launcher")!;

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
});

describe("guide launcher over a scout drone fold", () => {
  it("opens the card when '?' is tapped while the scout fold hides it", () => {
    setGuideStatus("active", EMAIL);
    const state = playerState();
    refreshOnboardingChecklistHighlight(state);
    document.body.classList.add("scout-focus");
    expect(cardEl().hasAttribute("hidden")).toBe(false); // open, but folded away by the scout CSS
    launcher().click();
    refreshOnboardingChecklistHighlight(state);
    expect(root().classList.contains("tg-scout-peek")).toBe(true);
    expect(cardEl().hasAttribute("hidden")).toBe(false);
    // Minimise from the card: back to the launcher.
    root().querySelector<HTMLElement>(".tg-collapse")!.click();
    refreshOnboardingChecklistHighlight(state);
    expect(cardEl().hasAttribute("hidden")).toBe(true);
    // And "?" opens it again.
    launcher().click();
    refreshOnboardingChecklistHighlight(state);
    expect(cardEl().hasAttribute("hidden")).toBe(false);
    // The next flight folds it again.
    clearGuideScoutPeek();
    expect(root().classList.contains("tg-scout-peek")).toBe(false);
  });

  it("only folds the card until '?' is tapped, and keeps the launcher's '?' centred", () => {
    const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../client-scout-drone/client-scout-drone-hud.css"), "utf8");
    expect(css).toContain("body.scout-focus #tutorial-guide-root:not(.tg-scout-peek) .tg-card { display: none !important; }");
    expect(css).toContain("body.scout-focus #tutorial-guide-root:not(.tg-scout-peek) .tg-launcher { display: grid !important; }");
    expect(css).not.toMatch(/tutorial-guide-root[^{]*\.tg-launcher \{ display: inline-flex/);
  });
});
