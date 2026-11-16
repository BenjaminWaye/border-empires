import { describe, expect, it } from "vitest";
import { buildPlaceHtml } from "./client-hud-v2-build-list.js";
import { buildSlotsHtml, createSlotPulse } from "./client-hud-v2-tracker.js";
import { townScreenRegions } from "./client-hud-v2-town.js";
import { BUILD_PLACED_FLASH_MS, nextPlaceFlash, placeButtonState } from "../client-queue-logic/client-build-placed-feedback.js";
import type { Tile, TileActionDef, TileMenuView } from "../client-types.js";

const buildings = [{ id: "build_fort", label: "Fort" } as unknown as TileActionDef];

// Regression: Place gave no visible sign the press went through (the map isn't visible on a phone).
describe("Place confirmation", () => {
  it("turns the Place button into a confirmation right after a press", () => {
    const base = { buildings, selection: "build_fort", targetKey: "1,1", placeLabel: "Place" };
    expect(buildPlaceHtml(base)).toContain(">Place</button>");
    expect(buildPlaceHtml({ ...base, placed: "started" })).toContain(">✓ Placed</button>");
    expect(buildPlaceHtml({ ...base, placed: "queued" })).toContain("v2t-place-done");
    expect(buildPlaceHtml({ ...base, placed: "queued" })).toContain(">✓ Queued</button>");
  });

  it("highlights Dev slots for a moment when a build takes a slot or joins the queue, not when one frees", () => {
    const pulse = createSlotPulse();
    expect(pulse(1, 0, 0)).toBe(false);
    expect(pulse(2, 0, 100)).toBe(true);
    expect(pulse(2, 0, 1_000)).toBe(true);
    expect(pulse(2, 0, 2_200)).toBe(false);
    expect(pulse(2, 1, 3_000)).toBe(true);
    expect(pulse(1, 0, 6_000)).toBe(false);
    expect(buildSlotsHtml({ busy: 2, limit: 3 }, false, true)).toContain("hud-v2-slots-pulse");
  });

  // Regression: once "✓ Placed" faded the button read plain "Place" again, so on a phone a placed
  // building looked like it never went through.
  it("reads Place another after the confirmation fades, for the building already placed", () => {
    const town = { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", town: { name: "Halveth", type: "MARKET", population: 50, populationTier: "TOWN" } } as unknown as Tile;
    const view = { title: "Halveth (5, 5)", subtitle: "", tabs: ["actions"], overviewLines: [], actions: [], buildings, crystal: [] } as unknown as TileMenuView;
    const regions = (over: { placed?: "started"; placedBefore?: boolean }) =>
      townScreenRegions({ town, focus: town, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: "build_fort", category: undefined, ...over }).build;
    expect(regions({})).toContain(">Place</button>");
    expect(regions({ placed: "started", placedBefore: true })).toContain(">✓ Placed</button>");
    expect(regions({ placedBefore: true })).toContain(">Place another</button>");
  });

  it("keeps Place another for the action actually placed, through later rejected presses", () => {
    const placed = nextPlaceFlash(undefined, { went: true, outcome: "started" }, "build_fort", 0);
    expect(placeButtonState(placed, "build_fort", 100)).toEqual({ placed: "started", placedBefore: true });
    expect(placeButtonState(placed, "build_fort", BUILD_PLACED_FLASH_MS + 1)).toEqual({ placed: undefined, placedBefore: true });
    // Another building picked (or a bar action placed something else): plain Place, no borrowed "✓".
    expect(placeButtonState(placed, "build_watchtower", 100)).toEqual({ placed: undefined, placedBefore: false });
    const viaBar = nextPlaceFlash(undefined, { went: true, outcome: "started" }, "build_farmstead", 0);
    expect(placeButtonState(viaBar, "build_fort", 100)).toEqual({ placed: undefined, placedBefore: false });
    // A press rejected locally ends the "✓" at once but keeps the earlier success.
    const rejected = nextPlaceFlash(placed, { went: false, outcome: "started" }, "build_fort", 100);
    expect(placeButtonState(rejected, "build_fort", 200)).toEqual({ placed: undefined, placedBefore: true });
    expect(nextPlaceFlash(undefined, { went: false, outcome: undefined }, "build_fort", 0)).toBeUndefined();
  });
});
