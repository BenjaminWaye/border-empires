// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile, TileMenuView } from "../client-types.js";
import { foodShortageForState, foodShortageHtml, primaryFoodFix, scanFoodSources } from "./client-hud-v2-food-shortage.js";
import { runFoodFix } from "./client-hud-v2-food-fix.js";
import { townScreenRegions } from "./client-hud-v2-town.js";
import type { HudV2Deps } from "./client-hud-v2-context.js";

const tile = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as unknown as Tile;
const mine = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => tile(x, y, { ownerId: "me", ownershipState: "SETTLED", ...extra });
const town = mine(10, 10, { town: { type: "MARKET", populationTier: "TOWN", name: "Bryn", isFed: false, population: 2_000 } });
const ring = (): Tile[] => {
  const tiles: Tile[] = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dy) tiles.push(mine(10 + dx, 10 + dy));
  return tiles;
};
const state = (tiles: Tile[], food = { supply: 3, demand: 4 }, manpower = 1000) => {
  const s = createInitialState();
  s.me = "me";
  s.manpower = manpower;
  s.manpowerCap = 2000;
  s.homeTile = { x: 10, y: 10 };
  s.resourceSlots = { supply: { FOOD: food.supply, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: food.demand, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
  s.tiles = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  return s;
};
const fixFor = (s: ReturnType<typeof state>) => primaryFoodFix(foodShortageForState(s, scanFoodSources(s)));

// First-15 playtest 2026-11-28: "Short 1 FOOD" and "City growth paused (town is unfed)" named the problem but
// not the fix. Owner: the warning offers "Garrison a farm" or "Build a farm plot" directly.
describe("one-tap FOOD fix", () => {
  it("prefers grain or fish you hold, then unclaimed food in reach, then Farm Plots", () => {
    const farm = mine(12, 10, { resource: "FARM", ownershipState: "FRONTIER" });
    expect(fixFor(state([town, ...ring(), farm]))).toMatchObject({ kind: "garrison", x: 12, y: 10, label: "Garrison grain" });
    expect(fixFor(state([town, ...ring()]))).toMatchObject({ kind: "plots", x: 10, y: 10, count: 1, label: "Build 1 Farm Plot" });
    // Short 3, but only manpower for two plots.
    expect(fixFor(state([town, ...ring()], { supply: 1, demand: 4 }, 320))).toMatchObject({ kind: "plots", count: 2, label: "Build 2 Farm Plots" });
  });

  it("offers nothing when FOOD isn't short or nothing in reach fixes it", () => {
    expect(fixFor(state([town, ...ring()], { supply: 4, demand: 4 }))).toBeUndefined();
    expect(fixFor(state([town, ...ring()], undefined, 10))).toBeUndefined();
  });

  it("shows the fix beside the folded Short N FOOD header", () => {
    const html = foodShortageHtml(foodShortageForState(state([town, ...ring()]), scanFoodSources(state([town, ...ring()])))!, false);
    expect(html).toContain("Short 1 FOOD");
    expect(html).toContain('data-hud-v2-food-fix>Build 1 Farm Plot ›</button>');
  });

  it("offers it under an unfed town's paused growth on the town screen", () => {
    const view = { title: "Bryn", actions: [], buildings: [] } as unknown as TileMenuView;
    const base = { focus: town, townView: view, focusView: view, townIndex: 0, townCount: 1, buildSelection: undefined, category: undefined };
    expect(townScreenRegions({ ...base, town, foodFixLabel: "Garrison grain" }).left).toContain("data-hud-v2-food-fix>Garrison grain ›");
    const fed = mine(10, 10, { town: { type: "MARKET", populationTier: "TOWN", name: "Bryn", isFed: true, population: 2_000 } });
    expect(townScreenRegions({ ...base, town: fed, focus: fed, foodFixLabel: "Garrison grain" }).left).not.toContain("data-hud-v2-food-fix");
  });

  const depsFor = (s: ReturnType<typeof state>, settleEnabled: boolean) => {
    const actionFlow = {
      tileMenuViewForTile: vi.fn(() => ({ actions: [{ id: "settle_land", label: "Garrison", disabled: !settleEnabled }], buildings: [] })),
      openSingleTileActionMenu: vi.fn(),
      handleTileAction: vi.fn(),
      hideTileActionMenu: vi.fn()
    };
    const deps = { state: s, renderHud: vi.fn(), requestViewRefresh: vi.fn(), wrapX: (x: number) => x, wrapY: (y: number) => y, actionFlow } as unknown as HudV2Deps;
    return { deps, actionFlow };
  };

  it("garrisons the grain in one tap when its Garrison is open to you", () => {
    const s = state([town, ...ring(), mine(12, 10, { resource: "FARM", ownershipState: "FRONTIER" })]);
    const { deps, actionFlow } = depsFor(s, true);
    expect(runFoodFix(deps)).toBe("garrison");
    expect(actionFlow.handleTileAction).toHaveBeenCalledWith("settle_land", "12,10", undefined);
    expect(s.selected).toEqual({ x: 12, y: 10 });
  });

  it("jumps to the grain with its menu open when Garrison isn't available now", () => {
    const s = state([town, ...ring(), mine(12, 10, { resource: "FARM", ownershipState: "FRONTIER" })]);
    const { deps, actionFlow } = depsFor(s, false);
    expect(runFoodFix(deps)).toBe("shown");
    expect(actionFlow.handleTileAction).not.toHaveBeenCalled();
    expect(actionFlow.openSingleTileActionMenu).toHaveBeenCalled();
  });

  it("says so when nothing fixes it", () => {
    const s = state([town, ...ring()], undefined, 10);
    const { deps } = depsFor(s, true);
    expect(runFoodFix(deps)).toBe("none");
  });
});
