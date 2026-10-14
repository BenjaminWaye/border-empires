// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedEntryForEventLogEntry } from "./client-event-log-html.js";
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

  it("opens a centered dialog regardless of the camera, and View survey focuses the clue and dismisses it", () => {
    const view = vi.fn();
    occupationSurveyController.installViewHandler(view);
    occupationSurveyController.record(entry());
    sync(false);
    const popup = document.querySelector('[role="dialog"]');
    expect(popup?.getAttribute("aria-modal")).toBe("true");
    expect(popup?.textContent).toContain("Signs of Titanium nearby");
    expect(document.activeElement).toBe(popup?.querySelector("[data-survey-view]"));
    popup?.querySelector<HTMLButtonElement>("[data-survey-view]")?.click();
    expect(view).toHaveBeenCalledWith(expect.objectContaining({ resource: "TITANIUM", x: 14, y: 10 }));
    expect(document.querySelector(".occupation-survey-overlay")).toBeNull();
  });

  it("keeps important information visible until Got it is clicked, even after a minute", () => {
    vi.useFakeTimers();
    occupationSurveyController.record(entry());
    sync(true);
    vi.advanceTimersByTime(60_000);
    sync(false);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Signs of Titanium nearby");
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    sync(true);
    expect(document.querySelector(".occupation-survey-overlay")).toBeNull();
    expect(occupationSurveyController.currentReports()).toHaveLength(1);
  });

  it("queues discoveries and does not repeat a dismissed report on ordinary state updates", () => {
    const titanium = entry();
    const crystal = { ...entry(), surveyResource: "GEMS" as const, surveySignature: "REFRACTIVE_GROUND" as const };
    occupationSurveyController.reconcile([titanium, crystal]);
    sync(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Signs of Titanium nearby");
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Signs of Crystal nearby");
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    occupationSurveyController.reconcile([titanium, crystal]);
    sync(true);
    expect(document.querySelector(".occupation-survey-overlay")).toBeNull();
  });

  it("defers the popup until the town panel is dismissed", () => {
    occupationSurveyController.beginCapture();
    occupationSurveyController.record(entry());
    sync(true);
    expect(document.querySelector(".occupation-survey-overlay")).toBeNull();
    occupationSurveyController.endCapture(occupationSurveyController.currentReports());
    sync(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Signs of Titanium nearby");
  });

  it("restores standing reports directly, but skips resources whose reveal tech is researched", () => {
    const report = entry();
    occupationSurveyController.reconcile([report], ["masonry"], "researched:season-1");
    sync(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    occupationSurveyController.reconcile([report], [], "new-player:season-1");
    sync(true);
    expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Signs of Titanium nearby");
  });

  it("does not reopen dismissed history after a later town panel closes", () => {
    occupationSurveyController.record(entry());
    sync(true);
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    occupationSurveyController.beginCapture();
    occupationSurveyController.endCapture(occupationSurveyController.currentReports());
    sync(true);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it("closes a survey once its resource is researched and waits for login to finish before presenting", () => {
    occupationSurveyController.record(entry());
    const state = { camX: 10, camY: 10, camSubX: 0, camSubY: 0, selected: undefined };
    occupationSurveyController.sync({ ...state, presentationReady: false }, () => ({ sx: 0, sy: 0 }), 32, 16, 16);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    sync(true);
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    occupationSurveyController.sync({ ...state, techIds: ["masonry"] }, () => ({ sx: 0, sy: 0 }), 32, 16, 16);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });
});
