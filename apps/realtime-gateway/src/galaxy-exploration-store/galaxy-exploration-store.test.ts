import { describe, expect, it } from "vitest";
import { InMemoryGalaxyExplorationStore } from "./galaxy-exploration-store.js";

describe("InMemoryGalaxyExplorationStore", () => {
  it("returns an empty list for an owner with no surveys", async () => {
    const store = new InMemoryGalaxyExplorationStore();
    await expect(store.getSurveysForOwner("uid-1")).resolves.toEqual([]);
  });

  it("records a survey and returns it for the surveying owner only", async () => {
    const store = new InMemoryGalaxyExplorationStore();
    await store.recordSurvey({ authUid: "uid-1", seasonId: "season-1", stability: 80, garrison: 20, surveyedAt: 1000 });

    await expect(store.getSurveysForOwner("uid-1")).resolves.toEqual([
      { authUid: "uid-1", seasonId: "season-1", stability: 80, garrison: 20, surveyedAt: 1000 }
    ]);
    await expect(store.getSurveysForOwner("uid-2")).resolves.toEqual([]);
  });

  it("a later survey of the same target replaces the snapshot, not accumulates", async () => {
    const store = new InMemoryGalaxyExplorationStore();
    await store.recordSurvey({ authUid: "uid-1", seasonId: "season-1", stability: 80, garrison: 20, surveyedAt: 1000 });
    await store.recordSurvey({ authUid: "uid-1", seasonId: "season-1", stability: 40, garrison: 60, surveyedAt: 2000 });

    const surveys = await store.getSurveysForOwner("uid-1");
    expect(surveys).toHaveLength(1);
    expect(surveys[0]).toEqual({ authUid: "uid-1", seasonId: "season-1", stability: 40, garrison: 60, surveyedAt: 2000 });
  });
});
