// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { showTownCaptureOverlay } from "./client-town-capture.js";

vi.mock("../client-occupation-survey.js", () => ({
  occupationSurveyController: { beginCapture: vi.fn(), endCapture: vi.fn() }
}));

afterEach(() => { document.body.innerHTML = ""; });

describe("town capture manpower yield", () => {
  it("shows regeneration as a batch amount", () => {
    showTownCaptureOverlay({
      x: 1, y: 1, townName: "Test", populationTier: "TOWN",
      terrainProfile: "GRASS", coastal: false, population: 1000,
      maxPopulation: 2000, empireName: "House", ownedTownCount: 0,
      destroyed: false, onJumpToTown: () => {}
    });
    expect(document.querySelector("#town-capture-stats")?.textContent).toContain("+100 per batch");
    expect(document.querySelector("#town-capture-stats")?.textContent).not.toContain("/m");
  });
});
