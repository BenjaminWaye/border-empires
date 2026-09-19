// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { feedEntryForEventLogEntry } from "./client-event-log-html.js";
import { occupationSurveyController } from "./client-occupation-survey.js";
import { renderResourceRevealHtml } from "./client-resource-discovery-info.js";

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

  it("adds current local intelligence to the matching research card", () => {
    const html = renderResourceRevealHtml(tech("masonry"));
    expect(html).toContain("Occupation intelligence");
    expect(html).toContain("ferrous terrain");
  });
});
