// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";

const report = {
  id: "crystal-survey-1", type: "OCCUPATION_SURVEY", text: "Crystal nearby",
  surveyResource: "GEMS" as const, surveySignature: "REFRACTIVE_GROUND" as const,
  surveyX: 14, surveyY: 10, bearing: "north",
  distanceBand: "MID" as "NEAR" | "MID" | "FAR", confidence: "MEDIUM" as const
};
const load = async (scope = "player:season", entries = [report]) => {
  vi.resetModules(); // A fresh controller models a full page reload, retaining browser storage.
  const { occupationSurveyController: controller } = await import("../client-occupation-survey.js");
  controller.reconcile(entries, [], scope);
  controller.sync(
    { camX: 0, camY: 0, camSubX: 0, camSubY: 0, selected: undefined },
    () => ({ sx: 0, sy: 0 }), 32, 16, 16
  );
  return controller;
};
const popup = () => document.querySelector('[role="dialog"]');

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("survey dismissal persistence", () => {
  it.each(["dismiss", "view"])("remembers the %s button after reload while retaining the clue", async (action) => {
    await load();
    document.querySelector<HTMLButtonElement>(`[data-survey-${action}]`)?.click();
    expect(popup()).toBeNull();
    const restored = await load();
    expect(popup()).toBeNull();
    expect(restored.currentForResource("GEMS")?.id).toBe(report.id);
    restored.beginCapture();
    restored.endCapture(restored.currentReports());
    expect(popup()).toBeNull();
  });

  it("isolates players and seasons and remembers the original scope when returning", async () => {
    await load();
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    await load("other-player:season");
    expect(popup()).not.toBeNull();
    document.body.innerHTML = "";
    await load("player:next-season");
    expect(popup()).not.toBeNull();
    document.body.innerHTML = "";
    await load();
    expect(popup()).toBeNull();
  });

  it("still presents a genuinely new report for the same resource", async () => {
    await load();
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    await load("player:season", [{ ...report, id: "closer-crystal-survey", distanceBand: "NEAR" }]);
    expect(popup()).not.toBeNull();
  });

  it("does not acknowledge a popup merely because it was hidden", async () => {
    const controller = await load();
    controller.beginCapture();
    expect(popup()).toBeNull();
    await load();
    expect(popup()).not.toBeNull();
  });

  it("ignores malformed saved data and replaces it on dismissal", async () => {
    localStorage.setItem("be:occupation-survey-dismissals:v1", "not json");
    await load();
    expect(popup()).not.toBeNull();
    document.querySelector<HTMLButtonElement>("[data-survey-dismiss]")?.click();
    await load();
    expect(popup()).toBeNull();
  });

  it("bounds saved history to sixteen scopes and three resource IDs per scope", async () => {
    const { rememberSurveyDismissal } = await import("./client-occupation-survey-dismissals.js");
    const eviction = vi.spyOn(console, "info").mockImplementation(() => {});
    for (let index = 0; index < 20; index++) {
      rememberSurveyDismissal(`player:season-${index}`, "GEMS", "old-report");
      rememberSurveyDismissal(`player:season-${index}`, "GEMS", "latest-report");
    }
    const stored = JSON.parse(localStorage.getItem("be:occupation-survey-dismissals:v1") ?? "[]");
    expect(stored).toHaveLength(16);
    expect(stored[0]).toEqual({ scope: "player:season-4", reports: { GEMS: "latest-report" } });
    expect(eviction).toHaveBeenCalledTimes(4);
  });

  it("keeps dismissal functional when browser storage is blocked", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    const controller = await load();
    expect(() => controller.dismiss()).not.toThrow();
    expect(popup()).toBeNull();
  });
});
