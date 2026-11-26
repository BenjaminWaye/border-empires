import { describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { townFocusLockedInMs, townTileAtFocus } from "./client-town-focus-projection.js";

const tile = (town: Partial<NonNullable<Tile["town"]>>): Pick<Tile, "town" | "yieldRate"> => ({
  town: { goldPerMinute: 0.1, populationGrowthPerMinute: 10, ...town } as NonNullable<Tile["town"]>
});

// Playtest 2026-11-26: after switching focus, the town's Coin/day, growth per minute and "Great City in …" stayed at
// the old focus, because those are server figures computed at the focus the server had applied.
describe("townTileAtFocus", () => {
  it("moves Coin and growth from the server's applied focus to the one just confirmed", () => {
    const projected = townTileAtFocus(tile({ focus: "LEVY", pendingFocus: "COMMERCE", pendingFocusAt: 1, goldPerMinute: 0.09, populationGrowthPerMinute: 9 }));
    expect(projected.town!.goldPerMinute).toBeCloseTo(0.12, 9);
    expect(projected.town!.populationGrowthPerMinute).toBeCloseTo(9, 9);
    expect(projected.town).toMatchObject({ focus: "COMMERCE" });
    expect(projected.town!.pendingFocus).toBeUndefined();
  });

  it("projects a previewed focus, and leaves a settled town untouched", () => {
    const settled = tile({ focus: "GROWTH", populationGrowthPerMinute: 12 });
    expect(townTileAtFocus(settled)).toBe(settled);
    expect(townTileAtFocus(settled, "BALANCED").town!.populationGrowthPerMinute).toBeCloseTo(10, 9);
    expect(townTileAtFocus(settled, "BALANCED").town!.focus).toBeUndefined();
  });

  // Review of PR #3003: a dock town's yield adds dock income, which focus does not scale.
  it("moves only the town's share of a dock town's yield", () => {
    const dock = { ...tile({ pendingFocus: "COMMERCE", pendingFocusAt: 1, goldPerMinute: 0.1 }), yieldRate: { goldPerMinute: 0.5 } };
    expect(townTileAtFocus(dock).yieldRate!.goldPerMinute).toBeCloseTo(0.52, 9);
  });

  it("keeps a town locked a little past the server's time, so a confirm the server would refuse is never sent", () => {
    expect(townFocusLockedInMs({ focusLockedUntil: 1_000_000 }, 1_010_000)).toBe(20_000);
    expect(townFocusLockedInMs({ focusLockedUntil: 1_000_000 }, 1_030_000)).toBe(0);
    expect(townFocusLockedInMs({}, 0)).toBe(0);
  });
});
