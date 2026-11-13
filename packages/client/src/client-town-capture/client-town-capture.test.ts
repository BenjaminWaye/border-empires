// @vitest-environment happy-dom
// Playtest 2026-11-12: at 375x667 the capture card was taller than the screen, centred so its ✕ sat above
// the top edge and "Jump to Town" below the bottom, with no scroll and no Esc: the game soft-locked twice.
import { afterEach, describe, expect, it, vi } from "vitest";
import { occupationSurveyController } from "../client-occupation-survey.js";
import { showTownCaptureOverlay, type TownCaptureInfo } from "./client-town-capture.js";

const info = (extra: Partial<TownCaptureInfo> = {}): TownCaptureInfo => ({
  x: 289, y: 203, townName: "Tumblerun Green", populationTier: "TOWN", terrainProfile: "GRASS", coastal: true,
  population: 16_792, maxPopulation: 100_000, empireName: "Nordmark", ownedTownCount: 1, destroyed: false,
  surveyReports: [{ text: "Ferrous dust south of this town." }, { text: "Blackwood canopy west of the walls." }] as TownCaptureInfo["surveyReports"],
  onJumpToTown: () => undefined,
  ...extra
});

const styles = (): string => Array.from(document.head.querySelectorAll("style")).map((s) => s.textContent ?? "").join("\n");
const rule = (selector: string): string => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\#]/g, "\\$&");
  return styles().match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? "";
};

describe("town capture card on a short phone", () => {
  afterEach(() => {
    document.getElementById("town-capture-overlay")?.remove();
    vi.restoreAllMocks();
  });

  it("keeps the ✕ and Jump to Town outside the scrolling body", () => {
    showTownCaptureOverlay(info());
    const body = document.getElementById("town-capture-body");
    const footer = document.getElementById("town-capture-footer");
    expect(body?.querySelector("#town-capture-survey")).not.toBeNull();
    expect(body?.contains(document.getElementById("town-capture-jump"))).toBe(false);
    expect(footer?.contains(document.getElementById("town-capture-jump"))).toBe(true);
    expect(body?.contains(document.getElementById("town-capture-close"))).toBe(false);
  });

  // happy-dom has no layout: guard the rules that cap the card to the screen and scroll its middle.
  it("caps the card to the overlay and scrolls only the body", () => {
    showTownCaptureOverlay(info());
    const modal = rule("#town-capture-modal");
    expect(modal).toMatch(/max-height:\s*100%/);
    expect(modal).toMatch(/grid-template-rows:\s*auto minmax\(0, 1fr\) auto/);
    expect(modal).toMatch(/width:\s*min\(520px, 100%\)/);
    const body = rule("#town-capture-body");
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/min-height:\s*0/);
  });

  it("closes on Escape, once, and stops listening", () => {
    const end = vi.spyOn(occupationSurveyController, "endCapture");
    showTownCaptureOverlay(info());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.getElementById("town-capture-overlay")).toBeNull();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(end).toHaveBeenCalledTimes(1);
  });

  it("ignores other keys", () => {
    showTownCaptureOverlay(info());
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(document.getElementById("town-capture-overlay")).not.toBeNull();
  });
});
