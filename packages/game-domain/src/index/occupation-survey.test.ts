import { describe, expect, it } from "vitest";
import { appendOccupationSurveyReports } from "./occupation-survey.js";
import type { DomainPlayer, DomainTileState } from "./index.js";

const player = (): DomainPlayer => ({ id: "p1", isAi: false, points: 0, manpower: 0, techIds: new Set(), allies: new Set() });

describe("appendOccupationSurveyReports", () => {
  it("records captor-only local reports without exact deposit data", () => {
    const p = player();
    const tiles = new Map<string, DomainTileState>([
      ["4,1", { x: 4, y: 1, terrain: "LAND", prospectSignature: "FERROUS_DUST", resource: "TITANIUM" }],
      ["1,4", { x: 1, y: 4, terrain: "LAND", prospectSignature: "BLACKWOOD_CANOPY" }]
    ]);
    appendOccupationSurveyReports(p, tiles, 1, 1, 1000);
    expect(p.eventLog).toHaveLength(2);
    expect(p.eventLog?.every((entry) => entry.type === "OCCUPATION_SURVEY")).toBe(true);
    expect(p.eventLog?.[0]).not.toHaveProperty("resource");
    expect(p.eventLog?.[0]?.surveyResource).toBe("TITANIUM");
    expect(p.eventLog?.[0]?.confidence).toBe("HIGH");
  });

  it("does not report a resource whose reveal tech is already researched", () => {
    const p = player();
    p.techIds.add("masonry");
    appendOccupationSurveyReports(p, new Map([["4,1", { x: 4, y: 1, terrain: "LAND", prospectSignature: "FERROUS_DUST" }]]), 1, 1, 1000);
    expect(p.eventLog ?? []).toEqual([]);
  });
});
