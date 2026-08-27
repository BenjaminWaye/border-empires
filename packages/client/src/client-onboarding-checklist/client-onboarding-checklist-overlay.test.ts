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
  it("renders the bubble with a badge of 2 remaining steps when no TOWN-tier town is owned yet", () => {
    // Player's free starting SETTLEMENT plus an out-of-reach neutral town --
    // enough of a reach anchor to land on EXPAND_TOWN (not EXPAND_RELAY_BEACON).
    const tiles = tilesMap([
      tile(0, 0, { ownerId: "p1", ownershipState: "SETTLED", town: { type: "FARMING", populationTier: "SETTLEMENT" } as never }),
      tile(2, 0, { town: { type: "MARKET", populationTier: "TOWN" } as never })
    ]);
    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.getElementById("onboarding-checklist-bubble")).not.toBeNull();
    expect(document.querySelector(".onb-badge")?.textContent).toBe("2");
    expect(highlights).toEqual([{ x: 2, y: 0 }]);
  });

  it("shows 1 remaining step and food progress once the town is settled", () => {
    const tiles = tilesMap([
      ownTown(5, 5, "p1"),
      tile(6, 5, { resource: "FARM", ownerId: "p1" }),
      tile(7, 5, { resource: "FISH" })
    ]);
    const highlights = renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.querySelector(".onb-badge")?.textContent).toBe("1");
    expect(document.querySelector(".onb-panel-step")?.textContent).toContain("1/4 food tiles");
    expect(highlights).toEqual([
      { x: 5, y: 5 },
      { x: 7, y: 5 }
    ]);
  });

  it("checks off and strikes through the town goal once it's done, while the food goal stays open", () => {
    const tiles = tilesMap([ownTown(5, 5, "p1"), tile(6, 5, { resource: "FARM" })]);
    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    const goals = document.querySelectorAll(".onb-goal");
    expect(goals).toHaveLength(2);
    expect(goals[0]?.classList.contains("onb-goal-done")).toBe(true);
    expect(goals[0]?.textContent).toContain("Find a town and Expand To it");
    expect(goals[1]?.classList.contains("onb-goal-done")).toBe(false);
  });

  it("shows a Relay Beacon note (no third checkbox) when nothing is in reach", () => {
    // No owned tile at all -- no reach anchor, so neither goal has a target.
    const tiles = tilesMap([tile(1, 1)]);
    renderOnboardingChecklistOverlay(tiles, "p1", "a@example.com");

    expect(document.querySelectorAll(".onb-goal")).toHaveLength(2);
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
