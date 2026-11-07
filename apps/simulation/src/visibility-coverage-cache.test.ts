import { describe, expect, it } from "vitest";
import type { Terrain } from "@border-empires/shared";
import { VisibilityCoverageCache, VisibilityCoverageTracker } from "./visibility-coverage-cache.js";
import { VisionFootprintTable } from "./vision-footprint-table.js";

describe("VisibilityCoverageCache", () => {
  it("makes a footprint visible after add and invisible after remove", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(false);
    cache.addFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    expect(cache.isVisible("viewer-1", "9,10")).toBe(true);
    expect(cache.isVisible("viewer-1", "8,10")).toBe(false);
    cache.removeFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(false);
  });

  it("keeps a cell visible while any overlapping footprint still covers it (refcounting)", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    // Two adjacent tiles both dilate over (10,10) with radius 1.
    cache.addFootprint("viewer-1", 10, 10, 1);
    cache.addFootprint("viewer-1", 11, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    // Losing the first tile must NOT hide the cell — the second still covers it.
    cache.removeFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    // Losing the second tile finally removes the last contributor.
    cache.removeFootprint("viewer-1", 11, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(false);
  });

  it("wraps toroidally at world edges", () => {
    const cache = new VisibilityCoverageCache(10, 10);
    cache.addFootprint("viewer-1", 0, 0, 1);
    expect(cache.isVisible("viewer-1", "9,9")).toBe(true);
    expect(cache.isVisible("viewer-1", "1,1")).toBe(true);
  });

  it("keeps viewers independent", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    cache.addFootprint("viewer-1", 10, 10, 1);
    expect(cache.isVisible("viewer-1", "10,10")).toBe(true);
    expect(cache.isVisible("viewer-2", "10,10")).toBe(false);
  });

  it("bulk add/remove of a source contribution matches per-tile add/remove", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    const territory = ["10,10", "11,10", "12,11"];
    cache.addSourceContribution("viewer-1", territory, 2);
    for (const tileKey of territory) {
      const [x, y] = tileKey.split(",").map(Number);
      expect(cache.isVisible("viewer-1", `${x},${y}`)).toBe(true);
    }
    // A cell only within range of (10,10) should be visible; far cell should not.
    expect(cache.isVisible("viewer-1", "50,50")).toBe(false);

    cache.removeSourceContribution("viewer-1", territory, 2);
    expect(cache.visibleKeysForViewer("viewer-1").size).toBe(0);
  });

  it("removeFootprint on an unknown viewer is a no-op", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    expect(() => cache.removeFootprint("nobody", 5, 5, 1)).not.toThrow();
  });

  it("with no footprint table injected, behaves exactly as before terrain occlusion (backward compatible default)", () => {
    const cache = new VisibilityCoverageCache(200, 200);
    cache.addFootprint("viewer-1", 10, 10, 3);
    expect(cache.isVisible("viewer-1", "13,10")).toBe(true);
  });

  it("applies an injected footprint table's mountain occlusion to the hot add/removeFootprint path", () => {
    const terrainAt = (x: number, y: number): Terrain | undefined => (x === 11 && y === 10 ? "MOUNTAIN" : "LAND");
    const footprintTable = new VisionFootprintTable(200, 200, { terrainAt, getTerrainEpoch: () => 0 });
    const cache = new VisibilityCoverageCache(200, 200, footprintTable);
    cache.addFootprint("viewer-1", 10, 10, 3);
    expect(cache.isVisible("viewer-1", "11,10")).toBe(true); // mountain tile itself visible
    expect(cache.isVisible("viewer-1", "12,10")).toBe(false); // behind mountain, occluded
    expect(cache.isVisible("viewer-1", "13,10")).toBe(false); // further behind, occluded
    expect(cache.isVisible("viewer-1", "10,13")).toBe(true); // unrelated bearing, unaffected

    cache.removeFootprint("viewer-1", 10, 10, 3);
    expect(cache.isVisible("viewer-1", "11,10")).toBe(false);
  });
});

describe("Relay Beacon vision over forest", () => {
  // Forest on every tile south of row 10, one mountain two tiles east of (10,10).
  const makeTracker = () => {
    const footprintTable = new VisionFootprintTable(200, 200, {
      terrainAt: (x, y) => (x === 12 && y === 10 ? "MOUNTAIN" : "LAND"),
      getTerrainEpoch: () => 0,
      forestAt: (_x, y) => y > 10
    });
    return new VisibilityCoverageTracker(
      200,
      200,
      {
        visionRadiusForPlayer: () => 3,
        getPlayer: (id) => ({ id, allies: new Set<string>() }),
        territoryTileKeysForPlayer: () => new Set<string>(),
        settledTileKeysForPlayer: () => new Set<string>(),
        frontierTileKeysForPlayer: () => new Set<string>()
      },
      footprintTable
    );
  };

  it("sees its full ring through forest while mountains still block it", () => {
    const tracker = makeTracker();
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 5);
    expect(tracker.isVisible("viewer-1", "10,15")).toBe(true); // 5 rows into forest
    expect(tracker.isVisible("viewer-1", "13,14")).toBe(true);
    expect(tracker.isVisible("viewer-1", "12,10")).toBe(true); // the mountain itself
    expect(tracker.isVisible("viewer-1", "13,10")).toBe(false); // behind it
    tracker.removeOutpostVisionBonus("viewer-1", 10, 10);
    expect(tracker.isVisible("viewer-1", "10,15")).toBe(false); // removal releases the same cells
    expect(tracker.isVisible("viewer-1", "12,10")).toBe(false);
  });

  it("mirrors the forest-ignoring ring to an ally and withdraws exactly it", () => {
    const tracker = makeTracker();
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 5);
    const callbacks = { onEnter: () => {}, onLeave: () => {} };
    tracker.syncAllianceChange("viewer-1", "ally-1", true, callbacks);
    expect(tracker.isVisible("ally-1", "10,15")).toBe(true);
    tracker.syncAllianceChange("viewer-1", "ally-1", false, callbacks);
    expect(tracker.isVisible("ally-1", "10,15")).toBe(false);
    expect(tracker.isVisible("ally-1", "10,11")).toBe(false);
  });

  it("re-sets a new radius (Survey Corps) without leaking the old ring", () => {
    const tracker = makeTracker();
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 5);
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 2);
    expect(tracker.isVisible("viewer-1", "10,12")).toBe(true);
    expect(tracker.isVisible("viewer-1", "10,15")).toBe(false);
    tracker.removeOutpostVisionBonus("viewer-1", 10, 10);
    expect(tracker.isVisible("viewer-1", "10,12")).toBe(false);
  });

  it("leaves forest occlusion in place for territory and Aether Tower vision", () => {
    const tracker = makeTracker();
    tracker.tileOwnershipChanged(undefined, "viewer-1", 10, 10);
    tracker.setObservatoryVisionBonus("viewer-1", 10, 10, 5);
    expect(tracker.isVisible("viewer-1", "10,12")).toBe(true); // forest tile + 1 past it
    expect(tracker.isVisible("viewer-1", "10,13")).toBe(false);
    expect(tracker.isVisible("viewer-1", "10,15")).toBe(false);
  });
});

describe("VisibilityCoverageTracker town +1 reveal", () => {
  const makeTracker = (radius: () => number) =>
    new VisibilityCoverageTracker(200, 200, {
      visionRadiusForPlayer: radius,
      getPlayer: (id) => ({ id, allies: new Set<string>() }),
      territoryTileKeysForPlayer: () => new Set<string>(),
      settledTileKeysForPlayer: () => new Set<string>(),
      frontierTileKeysForPlayer: () => new Set<string>()
    });

  it("a town tile's own reveal extends one extra ring beyond a plain tile", () => {
    const tracker = makeTracker(() => 1);
    // Plain owned tile at (20,10): base radius 1.
    tracker.tileOwnershipChanged(undefined, "viewer-1", 20, 10);
    expect(tracker.isVisible("viewer-1", "21,10")).toBe(true); // dx=1
    expect(tracker.isVisible("viewer-1", "22,10")).toBe(false); // dx=2 outside radius 1

    // Town owned tile at (10,10): base radius 1 + 1 ring via town bonus.
    tracker.tileOwnershipChanged(undefined, "viewer-1", 10, 10);
    tracker.setTownVisionBonus("viewer-1", 10, 10, 2);
    expect(tracker.isVisible("viewer-1", "11,10")).toBe(true);
    expect(tracker.isVisible("viewer-1", "12,10")).toBe(true); // extra ring
    expect(tracker.isVisible("viewer-1", "13,10")).toBe(false); // radius 2, not 3

    // Removing the town bonus hides the extra ring but keeps the base reveal.
    tracker.removeTownVisionBonus("viewer-1", 10, 10);
    expect(tracker.isVisible("viewer-1", "12,10")).toBe(false);
    expect(tracker.isVisible("viewer-1", "11,10")).toBe(true);
  });

  it("re-calling setTownVisionBonus moves the ring when the base radius changes", () => {
    let base = 1;
    const tracker = makeTracker(() => base);
    tracker.tileOwnershipChanged(undefined, "viewer-1", 10, 10);
    tracker.setTownVisionBonus("viewer-1", 10, 10, 2);
    expect(tracker.isVisible("viewer-1", "12,10")).toBe(true);
    expect(tracker.isVisible("viewer-1", "13,10")).toBe(false);

    // Base radius grows to 2 → town reveal becomes radius 3.
    base = 2;
    tracker.setTownVisionBonus("viewer-1", 10, 10, 3);
    expect(tracker.isVisible("viewer-1", "12,10")).toBe(true);
    expect(tracker.isVisible("viewer-1", "13,10")).toBe(true); // ring moved outward
  });
});

describe("VisibilityCoverageTracker outpost vision bonus", () => {
  const makeTracker = (radius: () => number) =>
    new VisibilityCoverageTracker(200, 200, {
      visionRadiusForPlayer: radius,
      getPlayer: (id) => ({ id, allies: new Set<string>() }),
      territoryTileKeysForPlayer: () => new Set<string>(),
      settledTileKeysForPlayer: () => new Set<string>(),
      frontierTileKeysForPlayer: () => new Set<string>()
    });

  it("a Relay Beacon's flat bonus is independent of the source's own base radius", () => {
    const tracker = makeTracker(() => 1);
    tracker.tileOwnershipChanged(undefined, "viewer-1", 10, 10);
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 5);
    expect(tracker.isVisible("viewer-1", "15,10")).toBe(true); // dx=5, within the flat bonus
    expect(tracker.isVisible("viewer-1", "16,10")).toBe(false); // dx=6, outside it

    tracker.removeOutpostVisionBonus("viewer-1", 10, 10);
    expect(tracker.isVisible("viewer-1", "15,10")).toBe(false);
    expect(tracker.isVisible("viewer-1", "11,10")).toBe(true); // base radius footprint untouched
  });

  it("re-calling setOutpostVisionBonus with a different radius moves the ring (a tech unlock widening it)", () => {
    const tracker = makeTracker(() => 1);
    tracker.tileOwnershipChanged(undefined, "viewer-1", 10, 10);
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 5);
    expect(tracker.isVisible("viewer-1", "15,10")).toBe(true);
    expect(tracker.isVisible("viewer-1", "16,10")).toBe(false);

    // Survey Corps adds +1 on top of the flat base.
    tracker.setOutpostVisionBonus("viewer-1", 10, 10, 6);
    expect(tracker.isVisible("viewer-1", "16,10")).toBe(true);
    expect(tracker.isVisible("viewer-1", "17,10")).toBe(false);
  });
});
