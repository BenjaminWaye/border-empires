// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedEntryForEventLogEntry, seedFeedFromEventLog } from "./client-event-log-html.js";
import { occupationSurveyController } from "./client-occupation-survey.js";
import { manifestFit } from "./client-manifest-detail/client-manifest-fit.js";

const tech = (id: string) => ({
  id,
  name: id,
  description: "desc",
  branch: "MILITARY",
  tier: 1,
  prereqIds: [],
  requirements: { canResearch: true, checklist: [] },
  effects: { revealResource: id === "masonry" ? "titanium" : id === "leatherworking" ? "umbrite" : "crystal" }
}) as never;

describe("occupation survey client parity", () => {
  it("keeps View survey focus coordinates broad and separate from the resource field", () => {
    const entry = {
      id: "survey-client-1",
      type: "OCCUPATION_SURVEY",
      text: "Ferrous dust west of this town indicates likely Titanium-bearing territory.",
      occurredAt: 1000,
      surveyResource: "TITANIUM" as const,
      surveySignature: "FERROUS_DUST" as const,
      surveyX: 31,
      surveyY: 42,
      bearing: "west",
      distanceBand: "MID" as const,
      confidence: "MEDIUM" as const
    };
    expect(feedEntryForEventLogEntry(entry)).toMatchObject({ focusX: 31, focusY: 42, actionLabel: "View survey" });
    expect(occupationSurveyController.currentForResource("TITANIUM")).toMatchObject({ x: 31, y: 42, signature: "FERROUS_DUST" });
  });

  it("turns current local intelligence into a Good pick reason on the matching Manifest", () => {
    const fit = manifestFit(tech("masonry"), {
      manpower: 0, hasBuildSite: () => false, ownsFish: false,
      resourceSlots: { supply: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } },
      clueNearTerritory: () => false,
      surveyReportFor: (resource) => occupationSurveyController.currentForResource(resource)
    });
    expect(fit.goodPickReasons).toContain("A town you garrisoned turned up signs of Titanium nearby");
  });
});

describe("occupation survey presentation", () => {
  const entry = () => ({
    id: `survey-ui-${crypto.randomUUID()}`, type: "OCCUPATION_SURVEY",
    text: "Ferrous dust east of this town indicates likely Titanium-bearing territory.",
    surveyResource: "TITANIUM" as const, surveySignature: "FERROUS_DUST" as const,
    surveyX: 14, surveyY: 10, bearing: "east",
    distanceBand: "NEAR" as const, confidence: "HIGH" as const
  });
  const sync = (onScreen: boolean): void => occupationSurveyController.sync(
    { camX: 10, camY: 10, camSubX: 0, camSubY: 0, selected: undefined },
    () => onScreen ? { sx: 200, sy: 250 } : { sx: -1000, sy: -1000 }, 32, 16, 16
  );
  beforeEach(() => {
    occupationSurveyController.beginCapture();
    occupationSurveyController.endCapture([]);
    occupationSurveyController.reconcile([], []);
  });
  afterEach(() => {
    occupationSurveyController.beginCapture();
    occupationSurveyController.endCapture([]);
    occupationSurveyController.reconcile([], []);
    vi.useRealTimers();
  });

  const pending = (): string[] => occupationSurveyController.pendingReports().map((report) => report.resource);
  const dialog = (): Element | null => document.querySelector('[role="dialog"]');
  /** A tap on the first clue's map pin (client-map-tip-pins.ts). */
  const tapFirstPin = (): void => {
    const first = occupationSurveyController.pendingReports()[0];
    if (first) occupationSurveyController.open(first.id);
  };

  // Owner, 2026-11-21: survey cards that opened on their own got in the way of play. A clue is a pin now.
  it("pins a new clue on the map instead of opening a card", () => {
    occupationSurveyController.record(entry());
    sync(true);
    expect(dialog()).toBeNull();
    expect(occupationSurveyController.pendingReports()).toEqual([expect.objectContaining({ resource: "TITANIUM", x: 14, y: 10 })]);
  });

  it("opens the clue's card from its pin, and View survey focuses the clue and dismisses it", () => {
    const view = vi.fn();
    occupationSurveyController.installViewHandler(view);
    occupationSurveyController.record(entry());
    sync(false);
    tapFirstPin();
    expect(dialog()?.getAttribute("aria-modal")).toBe("true");
    expect(dialog()?.textContent).toContain("Signs of Titanium nearby");
    expect(document.activeElement).toBe(dialog()?.querySelector("[data-survey-view]"));
    dialog()?.querySelector<HTMLButtonElement>("[data-survey-view]")?.click();
    expect(view).toHaveBeenCalledWith(expect.objectContaining({ resource: "TITANIUM", x: 14, y: 10 }));
    expect(document.querySelector(".occupation-survey-overlay")).toBeNull();
    expect(pending()).toEqual([]);
  });

  // Playtest day 1 (optimiser): the popup sent players to "Activity → Yours", a screen that no longer exists.
  // Then it pointed at the Manifest card, which no one would look at. Chronicle → Yours now lists open
  // survey clues (client-hud-v2-chronicle-surveys.ts), so the card points there.
  it("points to the Chronicle, which keeps the clue", () => {
    occupationSurveyController.record(entry());
    sync(true);
    tapFirstPin();
    const hint = document.querySelector(".occupation-survey-hint")?.textContent ?? "";
    expect(hint).toContain("Your Chronicle keeps this clue");
    expect(hint).not.toContain("Activity");
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
  });

  it("keeps an opened card up until Got it is clicked, even after a minute, and keeps the clue", () => {
    vi.useFakeTimers();
    occupationSurveyController.record(entry());
    sync(true);
    tapFirstPin();
    vi.advanceTimersByTime(60_000);
    sync(false);
    expect(dialog()?.textContent).toContain("Signs of Titanium nearby");
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    sync(true);
    expect(document.querySelector(".occupation-survey-overlay")).toBeNull();
    expect(pending()).toEqual([]);
    expect(occupationSurveyController.currentReports()).toHaveLength(1);
  });

  it("pins each clue, opens only the tapped one, and does not repeat a dismissed report on ordinary state updates", () => {
    const titanium = entry();
    const crystal = { ...entry(), surveyResource: "GEMS" as const, surveySignature: "REFRACTIVE_GROUND" as const };
    occupationSurveyController.reconcile([titanium, crystal]);
    sync(true);
    expect(pending()).toEqual(["TITANIUM", "GEMS"]);
    occupationSurveyController.open(crystal.id);
    expect(dialog()?.textContent).toContain("Signs of Crystal nearby");
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    // One card never opens the next on its own.
    expect(dialog()).toBeNull();
    expect(pending()).toEqual(["TITANIUM"]);
    tapFirstPin();
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    occupationSurveyController.reconcile([titanium, crystal]);
    sync(true);
    expect(pending()).toEqual([]);
  });

  it("remembers Escape as an acknowledgement when the player scope is restored", () => {
    const report = entry();
    occupationSurveyController.reconcile([report], [], "escape-player:season");
    sync(true);
    tapFirstPin();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(dialog()).toBeNull();
    occupationSurveyController.reconcile([], [], "another-player:season");
    occupationSurveyController.reconcile([report], [], "escape-player:season");
    sync(true);
    expect(pending()).toEqual([]);
  });

  it("holds the pin while the town capture card is open", () => {
    occupationSurveyController.beginCapture();
    occupationSurveyController.record(entry());
    sync(true);
    expect(pending()).toEqual([]);
    // The card did not list this clue (it arrived after the card was built), so it is pinned once the card closes.
    occupationSurveyController.endCapture([]);
    sync(true);
    expect(pending()).toEqual(["TITANIUM"]);
    expect(dialog()).toBeNull();
  });

  // 10-persona playtest: the capture card listed the clue, the player closed it, and the same clue
  // came back as its own survey card. Closing the card reads the clues it listed.
  it("does not re-pin a clue the town capture card already listed", () => {
    occupationSurveyController.beginCapture();
    occupationSurveyController.record(entry());
    occupationSurveyController.endCapture(occupationSurveyController.currentReports());
    sync(true);
    expect(pending()).toEqual([]);
    expect(occupationSurveyController.currentReports()).toHaveLength(1);
  });

  // Logging back in popped a survey card for a clue found while away. The login
  // backfill keeps the clue (Manifest card, Chronicles) without a pin; new clues are still pinned.
  it("restores standing reports quietly on login, skipping resources whose reveal tech is researched", () => {
    const report = entry();
    occupationSurveyController.reconcile([report], ["masonry"], "researched:season-1", false);
    sync(true);
    expect(pending()).toEqual([]);
    expect(occupationSurveyController.currentForResource("TITANIUM")).toBeUndefined();
    occupationSurveyController.reconcile([report], [], "new-player:season-1", false);
    sync(true);
    expect(pending()).toEqual([]);
    expect(occupationSurveyController.currentForResource("TITANIUM")?.id).toBe(report.id);
    occupationSurveyController.reconcile([report]);
    sync(true);
    expect(pending()).toEqual([]);
    const live = { ...entry(), surveyResource: "GEMS" as const, surveySignature: "REFRACTIVE_GROUND" as const };
    occupationSurveyController.reconcile([report, live]);
    sync(true);
    expect(pending()).toEqual(["GEMS"]);
    expect(dialog()).toBeNull();
  });

  it("does not pin a clue from the first-sync feed backfill, even one older than the feed window", () => {
    const old = { ...entry(), occurredAt: 1_000 };
    seedFeedFromEventLog({ feed: [] } as never, [old], 1_000 + 3 * 24 * 60 * 60 * 1000);
    occupationSurveyController.reconcile([old]);
    sync(true);
    expect(pending()).toEqual([]);
  });

  it("does not re-pin dismissed history after a later town panel closes", () => {
    occupationSurveyController.record(entry());
    sync(true);
    tapFirstPin();
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    occupationSurveyController.beginCapture();
    occupationSurveyController.endCapture(occupationSurveyController.currentReports());
    sync(true);
    expect(pending()).toEqual([]);
  });

  it("closes an open card while a screen covers the map, and drops the clue once its resource is researched", () => {
    occupationSurveyController.record(entry());
    const state = { camX: 10, camY: 10, camSubX: 0, camSubY: 0, selected: undefined };
    tapFirstPin();
    expect(dialog()).not.toBeNull();
    occupationSurveyController.sync({ ...state, presentationReady: false }, () => ({ sx: 0, sy: 0 }), 32, 16, 16);
    expect(dialog()).toBeNull();
    expect(pending()).toEqual(["TITANIUM"]);
    occupationSurveyController.sync({ ...state, techIds: ["masonry"] }, () => ({ sx: 0, sy: 0 }), 32, 16, 16);
    expect(pending()).toEqual([]);
  });
});
