// @vitest-environment happy-dom
// 10-persona playtest: one capture stacked the Town Captured card, the Waystation Activated card and
// survey cards on top of each other. Full-screen cards now show one at a time.
import { afterEach, describe, expect, it } from "vitest";
import {
  activeFullscreenCard,
  enqueueFullscreenCard,
  queuedFullscreenCardCount,
  resetFullscreenCardQueueForTests,
  tryClaimFullscreenCard,
  type FullscreenCardKey
} from "./client-fullscreen-card-queue.js";
import { showTownCaptureOverlay, type TownCaptureInfo } from "../client-town-capture/client-town-capture.js";
import { showWaystationActivationOverlay } from "../client-waystation-activation/client-waystation-activation.js";
import { occupationSurveyController } from "../client-occupation-survey.js";

type Fake = { key: FullscreenCardKey; element: HTMLElement; close: () => void };

const fakeCard = (key: FullscreenCardKey, shown: Fake[], label: string = key): void =>
  enqueueFullscreenCard({
    key,
    show: (close) => {
      const element = document.createElement("div");
      element.dataset.card = label;
      document.body.appendChild(element);
      shown.push({ key, element, close: () => { element.remove(); close(); } });
      return element;
    }
  });

const onScreen = (): string[] => Array.from(document.querySelectorAll<HTMLElement>("[data-card]")).map((el) => el.dataset.card ?? "");

afterEach(() => {
  resetFullscreenCardQueueForTests();
  document.body.innerHTML = "";
});

describe("full-screen card queue", () => {
  it("shows one card at a time and the next after dismissal", () => {
    const shown: Fake[] = [];
    fakeCard("town-capture", shown);
    fakeCard("waystation-activation", shown);
    expect(onScreen()).toEqual(["town-capture"]);
    expect(queuedFullscreenCardCount()).toBe(1);
    shown[0]?.close();
    expect(onScreen()).toEqual(["waystation-activation"]);
    shown[1]?.close();
    expect(onScreen()).toEqual([]);
    expect(activeFullscreenCard()).toBeUndefined();
  });

  it("keeps only the latest waiting card of a kind", () => {
    const shown: Fake[] = [];
    fakeCard("town-capture", shown, "first");
    fakeCard("waystation-activation", shown, "older waystation");
    fakeCard("waystation-activation", shown, "newer waystation");
    expect(queuedFullscreenCardCount()).toBe(1);
    shown[0]?.close();
    expect(onScreen()).toEqual(["newer waystation"]);
  });

  it("skips a card that had nothing to show", () => {
    const shown: Fake[] = [];
    enqueueFullscreenCard({ key: "waystation-activation", show: () => undefined });
    expect(activeFullscreenCard()).toBeUndefined();
    fakeCard("town-capture", shown);
    expect(onScreen()).toEqual(["town-capture"]);
  });

  it("lets a self-managed card claim the slot only when nothing is showing or waiting", () => {
    const shown: Fake[] = [];
    fakeCard("town-capture", shown);
    const blocked = document.createElement("div");
    expect(tryClaimFullscreenCard("occupation-survey", blocked)).toBeUndefined();
    shown[0]?.close();
    document.body.appendChild(blocked);
    const release = tryClaimFullscreenCard("occupation-survey", blocked);
    expect(release).toBeDefined();
    fakeCard("waystation-activation", shown);
    expect(onScreen()).toEqual([]);
    release?.();
    expect(onScreen()).toEqual(["waystation-activation"]);
  });

  it("frees the slot when a card is removed from the page without closing", () => {
    const shown: Fake[] = [];
    fakeCard("town-capture", shown);
    shown[0]?.element.remove();
    fakeCard("waystation-activation", shown);
    expect(onScreen()).toEqual(["waystation-activation"]);
  });

  it("hands the slot to the waiting card when the card on screen left the page without closing", () => {
    // Regression: the survey popup polls activeFullscreenCard(); a stale active card used to be
    // forgotten there without flushing, so the queued card never showed and the survey was blocked.
    const shown: Fake[] = [];
    fakeCard("town-capture", shown);
    fakeCard("waystation-activation", shown);
    shown[0]?.element.remove();
    expect(activeFullscreenCard()).toBe("waystation-activation");
    expect(onScreen()).toEqual(["waystation-activation"]);
    expect(queuedFullscreenCardCount()).toBe(0);
  });
});

const captureInfo = (): TownCaptureInfo => ({
  x: 5, y: 6, townName: "Tumblerun", populationTier: "TOWN", terrainProfile: "GRASS", coastal: false,
  population: 1_000, maxPopulation: 10_000, empireName: "Nordmark", ownedTownCount: 1, destroyed: false,
  onJumpToTown: () => undefined
});

const surveyEntry = {
  id: "survey-queue-1", type: "OCCUPATION_SURVEY", text: "Ferrous dust east of this town.",
  surveyResource: "TITANIUM" as const, surveySignature: "FERROUS_DUST" as const,
  surveyX: 14, surveyY: 10, bearing: "east", distanceBand: "NEAR" as const, confidence: "HIGH" as const
};

const syncSurvey = (): void => occupationSurveyController.sync(
  { camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined }, () => ({ sx: 0, sy: 0 }), 32, 16, 16
);

const visibleCards = (): string[] =>
  ["town-capture-overlay", "waystation-activation-overlay"].filter((id) => document.getElementById(id))
    .concat(document.querySelector(".occupation-survey-overlay") ? ["survey"] : []);

describe("post-capture cards", () => {
  it("shows the capture card, then the waystation card, then a tapped survey pin's card, one at a time", () => {
    showTownCaptureOverlay(captureInfo());
    showWaystationActivationOverlay({ x: 5, y: 6, grantedEffect: "GOLD", revealedTown: false, grantedGold: 50, grantedGoldTier: "SMALL", onJumpToLocation: () => undefined });
    occupationSurveyController.record(surveyEntry);
    syncSurvey();
    expect(visibleCards()).toEqual(["town-capture-overlay"]);

    document.querySelector<HTMLButtonElement>("#town-capture-close")?.click();
    syncSurvey();
    expect(visibleCards()).toEqual(["waystation-activation-overlay"]);

    document.querySelector<HTMLButtonElement>("#waystation-activation-close")?.click();
    syncSurvey();
    // The survey clue is a map pin; its card opens on a tap, never on its own.
    expect(visibleCards()).toEqual([]);
    occupationSurveyController.open(surveyEntry.id);
    expect(visibleCards()).toEqual(["survey"]);

    // A capture arriving while the survey is up waits for it.
    showTownCaptureOverlay(captureInfo());
    expect(visibleCards()).toEqual(["survey"]);
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    expect(visibleCards()).toEqual(["town-capture-overlay"]);
    document.querySelector<HTMLButtonElement>("#town-capture-close")?.click();
  });

  it("does not let a waystation card with nothing to show replace a real one waiting its turn", () => {
    showTownCaptureOverlay(captureInfo());
    showWaystationActivationOverlay({ x: 5, y: 6, grantedEffect: "GOLD", revealedTown: false, grantedGold: 50, grantedGoldTier: "SMALL", onJumpToLocation: () => undefined });
    // A TECH grant that resolved to nothing: no popup of its own.
    showWaystationActivationOverlay({ x: 7, y: 8, grantedEffect: "TECH", revealedTown: false, onJumpToLocation: () => undefined });
    expect(queuedFullscreenCardCount()).toBe(1);
    document.querySelector<HTMLButtonElement>("#town-capture-close")?.click();
    expect(visibleCards()).toEqual(["waystation-activation-overlay"]);
    expect(document.getElementById("waystation-activation-overlay")?.textContent).toContain("+50 Coin");
  });
});
