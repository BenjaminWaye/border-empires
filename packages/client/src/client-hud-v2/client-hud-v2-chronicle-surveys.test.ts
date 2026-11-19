// @vitest-environment happy-dom
import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { afterEach, describe, expect, it, vi } from "vitest";
import { occupationSurveyController, type OccupationSurveyReport } from "../client-occupation-survey.js";
import { createInitialState } from "../client-state/client-state.js";
import { screen, type HudV2Deps } from "./client-hud-v2-context.js";
import { chronicleHtml } from "./client-hud-v2-chronicle.js";
import { chronicleTabClick, renderChronicle, resetChronicleBadgeSeenForTests } from "./client-hud-v2-chronicle-runtime.js";
import { chronicleSurveyClick, RESOURCE_SURVEYS_HEADING } from "./client-hud-v2-chronicle-surveys.js";

// Logging in no longer pops survey cards, and the 24h timeline has no survey
// card, so a clue found while away had nowhere to be read (the popup pointed at
// the Manifest card). Chronicle → Yours now lists the open clues.

const report: OccupationSurveyReport = {
  id: "survey-1", resource: "TITANIUM", signature: "FERROUS_DUST", x: 31, y: 42,
  bearing: "west", distanceBand: "MID", confidence: "MEDIUM",
  text: "Ferrous dust west of this town indicates likely Titanium-bearing territory."
};
const timeline: PersonalActivityTimeline = {
  playerId: "me", from: 0, to: 1_000,
  summary: { tilesClaimed: 0, tilesLost: 0, waystationsActivated: 0, townsCaptured: 0, townsLost: 0, buildingsCompleted: 0 },
  goldPlundered: 0, goldRaidedFromYou: 0, manpowerSpentAttacking: 0, cards: [], rivals: [], truncated: false
};
const html = (surveys: readonly OccupationSurveyReport[], t: PersonalActivityTimeline | undefined = timeline, rivalFilter = ""): string => chronicleHtml({
  me: "me", timeline: t, loading: t === undefined, error: undefined, rivalFilter, selectedId: undefined,
  nameOf: () => undefined, colorOf: () => undefined, techName: () => undefined, nowMs: 1_000, surveys
});

describe("Chronicle resource surveys", () => {
  it("lists an open survey clue with a View button, even with no activity in the last 24 hours", () => {
    const out = html([report]);
    expect(out).toContain(RESOURCE_SURVEYS_HEADING);
    expect(out).toContain("Signs of Titanium nearby");
    expect(out).toContain('data-v2-chronicle-survey="survey-1" data-x="31" data-y="42"');
    expect(out).toContain("No activity in the last 24 hours");
  });

  it("shows the clues while the timeline is still loading", () => {
    expect(html([report], undefined)).toContain("Signs of Titanium nearby");
  });

  it("has no section when there are no open clues, or while a rival filter is on", () => {
    expect(html([])).not.toContain(RESOURCE_SURVEYS_HEADING);
    expect(html([report], timeline, "astrid")).not.toContain(RESOURCE_SURVEYS_HEADING);
  });

  it("View moves the camera to the clue, selects no tile and clears an event row's highlight", () => {
    document.body.innerHTML = html([report]);
    const state = createInitialState();
    state.selected = { x: 1, y: 1 };
    screen.chronicleSelectedId = "some-event";
    const deps = { state, wrapX: (x: number) => x, wrapY: (y: number) => y, requestViewRefresh: vi.fn(), renderHud: vi.fn() };
    const button = document.querySelector("[data-v2-chronicle-survey]")!;
    expect(chronicleSurveyClick(deps, button)).toBe(true);
    expect(state.camX).toBe(31);
    expect(state.selected).toBeUndefined();
    expect(screen.chronicleSelectedId).toBeUndefined();
    expect(deps.requestViewRefresh).toHaveBeenCalled();
    expect(chronicleSurveyClick(deps, document.body)).toBe(false);
  });
});

// The wiring: the Yours tab reads the clues the survey controller keeps (minus researched
// resources), and a View click inside the drawer is routed to the survey handler.
describe("Chronicle Yours tab wiring", () => {
  const surveyEntry = (id: string, resource: "TITANIUM" | "GEMS") => ({
    id, type: "OCCUPATION_SURVEY", text: `${resource} clue text.`, surveyResource: resource,
    surveySignature: resource === "TITANIUM" ? "FERROUS_DUST" as const : "REFRACTIVE_GROUND" as const,
    surveyX: 31, surveyY: 42, bearing: "west", distanceBand: "MID" as const, confidence: "MEDIUM" as const
  });
  afterEach(() => {
    occupationSurveyController.reconcile([], []);
    screen.chronicleTab = "yours";
    document.body.innerHTML = "";
    window.localStorage.clear();
    resetChronicleBadgeSeenForTests();
  });

  it("renders recorded clues, skips researched resources, and routes View to the camera", () => {
    occupationSurveyController.reconcile([surveyEntry("wired-titanium", "TITANIUM"), surveyEntry("wired-crystal", "GEMS")], [], "wiring:season", false);
    const state = createInitialState();
    state.techIds = ["masonry"]; // Titanium's Manifest is researched: its clue is spent.
    const deps = { state, ownerColor: () => "#888", sendGameMessage: () => true, renderHud: vi.fn(),
      wrapX: (x: number) => x, wrapY: (y: number) => y, requestViewRefresh: vi.fn() } as unknown as HudV2Deps;
    document.body.innerHTML = `<aside id="v2c-drawer"></aside>`;
    screen.chronicleTab = "yours";
    renderChronicle(deps);
    const drawer = document.getElementById("v2c-drawer")!;
    expect(drawer.textContent).toContain("Signs of Crystal nearby");
    expect(drawer.textContent).not.toContain("Signs of Titanium nearby");
    expect(chronicleTabClick(deps, drawer.querySelector("[data-v2-chronicle-survey]")!)).toBe(true);
    expect(state.camX).toBe(31);
  });
});
