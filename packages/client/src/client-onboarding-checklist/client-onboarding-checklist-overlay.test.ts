// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { renderOnboardingChecklistOverlay } from "./client-onboarding-checklist-overlay.js";
import { isOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";
import type { Tile } from "../client-types.js";

type PartialTile = Pick<Tile, "x" | "y" | "resource" | "ownerId" | "town">;

// exactOptionalPropertyTypes forbids `field: undefined` on optional Tile
// properties, so tiles are built piece by piece instead of a literal with
// explicit undefineds (mirrors client-onboarding-checklist.test.ts).
const tile = (x: number, y: number, extra: Partial<PartialTile> = {}): PartialTile => ({ x, y, ...extra });

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  // Reset the module-level dedup/expanded state the same way
  // client-discovery-tip-overlay.test.ts resets currentOverlayTipId: render
  // once against an empty/DONE-free state so one test doesn't leak into the
  // next.
  renderOnboardingChecklistOverlay([], "reset-player", "reset@example.com");
});

describe("renderOnboardingChecklistOverlay", () => {
  it("renders the bubble with a badge of 2 remaining steps when no town is settled", () => {
    const tiles = [tile(1, 1)];
    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.getElementById("onboarding-checklist-bubble")).not.toBeNull();
    expect(document.querySelector(".onb-badge")?.textContent).toBe("2");
    expect(highlights).toEqual([]);
  });

  it("shows 1 remaining step and food progress once the town is settled", () => {
    const tiles = [
      tile(5, 5, { ownerId: "p1", town: { type: "FARMING", name: "Capital" } as never }),
      tile(6, 5, { resource: "FARM", ownerId: "p1" }),
      tile(7, 5, { resource: "FISH" })
    ];
    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.querySelector(".onb-badge")?.textContent).toBe("1");
    expect(document.querySelector(".onb-panel-step")?.textContent).toContain("1/4 food slots");
    expect(highlights).toEqual([
      { x: 5, y: 5 },
      { x: 7, y: 5 }
    ]);
  });

  it("expands the panel on click and stays expanded across a re-render", () => {
    const tiles = [tile(1, 1)];
    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");
    expect(document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden")).toBe(true);

    (document.getElementById("onb-launcher") as HTMLButtonElement).click();
    expect(document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden")).toBe(false);

    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");
    expect(document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden")).toBe(false);
  });

  it("removes the bubble and persists completion exactly once when the checklist finishes", () => {
    const tiles = [
      tile(5, 5, { ownerId: "p1", town: { type: "FARMING", name: "Capital" } as never }),
      ...Array.from({ length: 4 }, (_, i) => tile(10 + i, 5, { resource: "FARM", ownerId: "p1" }))
    ];

    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "done@example.com");

    expect(highlights).toEqual([]);
    expect(document.getElementById("onboarding-checklist-bubble")).toBeNull();
    expect(isOnboardingChecklistCompleted("done@example.com")).toBe(true);
  });
});
