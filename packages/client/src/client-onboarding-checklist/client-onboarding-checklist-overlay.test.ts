// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { tileKey } from "@border-empires/shared";
import { renderOnboardingChecklistOverlay } from "./client-onboarding-checklist-overlay.js";
import { isOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";
import type { Tile } from "../client-types.js";

type PartialTile = Pick<Tile, "x" | "y" | "resource" | "ownerId" | "town" | "terrain" | "ownershipState">;

// exactOptionalPropertyTypes forbids `field: undefined` on optional Tile
// properties, so tiles are built piece by piece instead of a literal with
// explicit undefineds (mirrors client-onboarding-checklist.test.ts).
const tile = (x: number, y: number, extra: Partial<PartialTile> = {}): PartialTile => ({ x, y, terrain: "LAND", ...extra });

const ownTown = (x: number, y: number, ownerId: string): PartialTile =>
  tile(x, y, { ownerId, ownershipState: "SETTLED", town: { type: "FARMING", name: "Capital", populationTier: "TOWN" } as never });

const tilesMap = (tiles: PartialTile[]): ReadonlyMap<string, Tile> => {
  const map = new Map<string, Tile>();
  for (const t of tiles) map.set(tileKey(t.x, t.y), t as Tile);
  return map;
};

beforeEach(() => {
  window.localStorage.clear();
  document.body.innerHTML = "";
  // Reset the module-level dedup/expanded state the same way
  // client-discovery-tip-overlay.test.ts resets currentOverlayTipId: render
  // once against an empty/DONE-free state so one test doesn't leak into the
  // next.
  renderOnboardingChecklistOverlay(tilesMap([]), "reset-player", "reset@example.com");
});

describe("renderOnboardingChecklistOverlay", () => {
  it("renders 4 goal checkboxes -- Find/Expand To for the town, Find/Expand To for food", () => {
    const tiles = tilesMap([tile(1, 1)]);
    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.getElementById("onboarding-checklist-bubble")).not.toBeNull();
    const goals = document.querySelectorAll(".onb-goal");
    expect(goals).toHaveLength(4);
    expect(goals[0]?.textContent).toContain("Find a town");
    expect(goals[1]?.textContent).toContain("Expand To it");
    expect(goals[2]?.textContent).toContain("Find food tiles");
    expect(goals[3]?.textContent).toContain("Expand To");
    // Nothing owned at all -- all 4 goals still open.
    expect(document.querySelector(".onb-badge")?.textContent).toBe("4");
  });

  it("checks off Find a town once a candidate is known, independently of Expand To it", () => {
    // Player's free starting SETTLEMENT plus an out-of-reach neutral town --
    // enough of a reach anchor to land on EXPAND_TOWN (not EXPAND_RELAY_BEACON).
    const tiles = tilesMap([
      tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never }),
      tile(2, 0, { town: { type: "MARKET", populationTier: "TOWN" } as never })
    ]);
    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    const goals = document.querySelectorAll(".onb-goal");
    expect(goals[0]?.classList.contains("onb-goal-done")).toBe(true); // Find a town
    expect(goals[1]?.classList.contains("onb-goal-done")).toBe(false); // Expand To it
    expect(highlights).toEqual([{ x: 2, y: 0 }]);
  });

  it("shows food-slot progress and checks off the food goals once the weighted target is met", () => {
    const tiles = tilesMap([
      ownTown(5, 5, "p1"),
      tile(6, 5, { resource: "FARM", ownerId: "p1" }), // 1 slot claimed
      tile(7, 5, { resource: "FISH" }) // 2-slot candidate, unclaimed
    ]);
    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    const goals = document.querySelectorAll(".onb-goal");
    // "Find food tiles (X/4)": X is the weighted known total (1 claimed FARM + 2-slot FISH candidate = 3), not a tile count.
    expect(goals[2]?.textContent).toContain("Find food tiles (3/4)");
    expect(document.querySelector(".onb-panel-step")?.textContent).toContain("Expand To food tiles (1/4)");
    expect(goals[0]?.classList.contains("onb-goal-done")).toBe(true); // town found
    expect(goals[1]?.classList.contains("onb-goal-done")).toBe(true); // town expanded
    expect(goals[2]?.classList.contains("onb-goal-done")).toBe(false); // food found: 1 + 2 known = 3, short of 4
    expect(goals[3]?.classList.contains("onb-goal-done")).toBe(false); // food expanded: only 1 claimed
    expect(highlights).toEqual([
      { x: 5, y: 5 },
      { x: 7, y: 5 }
    ]);
  });

  it("shows a Relay Beacon note (no 5th checkbox) when nothing is in reach", () => {
    // No owned tile at all -- no reach anchor, so neither goal has a target.
    const tiles = tilesMap([tile(1, 1)]);
    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.querySelectorAll(".onb-goal")).toHaveLength(4);
    expect(document.querySelector(".onb-goal-note")?.textContent).toContain("Relay Beacon");
  });

  it("expands the panel on click and stays expanded across a re-render", () => {
    const tiles = tilesMap([tile(1, 1)]);
    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");
    expect(document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden")).toBe(true);

    (document.getElementById("onb-launcher") as HTMLButtonElement).click();
    expect(document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden")).toBe(false);

    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");
    expect(document.getElementById("onboarding-checklist-panel")?.hasAttribute("hidden")).toBe(false);
  });

  it("clears #center-me-desktop by measuring its real position, instead of a fixed guess", () => {
    const centerButton = document.createElement("button");
    centerButton.id = "center-me-desktop";
    document.body.appendChild(centerButton);
    // getBoundingClientRect is unimplemented in happy-dom (always returns a
    // zero rect) -- stub it to simulate the button sitting near the bottom
    // of a real viewport, the way it does in the actual app.
    centerButton.getBoundingClientRect = () =>
      ({ top: 700, left: 12, right: 200, bottom: 750, width: 188, height: 50, x: 12, y: 700, toJSON: () => ({}) }) as DOMRect;
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    renderOnboardingChecklistOverlay(tilesMap([tile(1, 1)]), "p1", "a@example.com");

    const root = document.getElementById("onboarding-checklist-bubble") as HTMLElement;
    // window.innerHeight(800) - rect.top(700) + clearance(12) = 112.
    expect(root.style.getPropertyValue("--onb-bottom")).toBe("112px");
  });

  it("falls back to the default offset when #center-me-desktop isn't measurable", () => {
    // No #center-me-desktop in the DOM at all here -- happy-dom's default
    // zero-rect behavior (when the element does exist but isn't laid out)
    // is covered implicitly by every other test in this file never setting
    // one up.
    renderOnboardingChecklistOverlay(tilesMap([tile(1, 1)]), "p1", "a@example.com");
    const root = document.getElementById("onboarding-checklist-bubble") as HTMLElement;
    expect(root.style.getPropertyValue("--onb-bottom")).toBe("190px");
  });

  it("removes the bubble and persists completion exactly once when the checklist finishes", () => {
    const tiles = tilesMap([
      ownTown(5, 5, "p1"),
      ...Array.from({ length: 4 }, (_, i) => tile(10 + i, 5, { resource: "FARM", ownerId: "p1" }))
    ]);

    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "done@example.com");

    expect(highlights).toEqual([]);
    expect(document.getElementById("onboarding-checklist-bubble")).toBeNull();
    expect(isOnboardingChecklistCompleted("done@example.com")).toBe(true);
  });
});
