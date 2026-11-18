// @vitest-environment happy-dom
import type { PersonalActivityTimeline } from "@border-empires/game-domain";
import { describe, expect, it, vi } from "vitest";
import type { OccupationSurveyReport } from "../client-occupation-survey.js";
import { chronicleHtml } from "./client-hud-v2-chronicle.js";
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
const html = (surveys: readonly OccupationSurveyReport[], t: PersonalActivityTimeline | undefined = timeline): string => chronicleHtml({
  me: "me", timeline: t, loading: t === undefined, error: undefined, rivalFilter: "", selectedId: undefined,
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

  it("has no section when there are no open clues", () => {
    expect(html([])).not.toContain(RESOURCE_SURVEYS_HEADING);
  });

  it("View moves the camera to the clue without opening a tile menu", () => {
    document.body.innerHTML = html([report]);
    const state = { camX: 0, camY: 0, camSubX: 1, camSubY: 1, zoom: 32, selected: undefined } as never;
    const deps = { state, wrapX: (x: number) => x, wrapY: (y: number) => y, requestViewRefresh: vi.fn(), renderHud: vi.fn() };
    const button = document.querySelector("[data-v2-chronicle-survey]")!;
    expect(chronicleSurveyClick(deps, button)).toBe(true);
    expect(state).toMatchObject({ camX: 31, selected: { x: 31, y: 42 } });
    expect(deps.requestViewRefresh).toHaveBeenCalled();
    expect(chronicleSurveyClick(deps, document.body)).toBe(false);
  });
});
