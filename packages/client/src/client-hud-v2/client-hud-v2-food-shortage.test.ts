// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { FARM_PLOT_UPGRADE_TECH_ID } from "@border-empires/shared";
import { createInitialState } from "../client-state/client-state.js";
import type { Tile } from "../client-types.js";
import { FOOD_NEARBY_TILES, foodShortageForState, foodShortageHtml, foodShortageSteps, scanFoodSources } from "./client-hud-v2-food-shortage.js";
import { nextStepScanForState } from "./client-hud-v2-next-step.js";
import { trackerHtml, type TrackerInput } from "./client-hud-v2-tracker.js";
import { trackerSummaryHtml } from "./client-hud-v2-compact.js";

const tile = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => ({ x, y, terrain: "LAND", ...extra }) as unknown as Tile;
const mine = (x: number, y: number, extra: Record<string, unknown> = {}): Tile => tile(x, y, { ownerId: "me", ownershipState: "SETTLED", ...extra });
const town = mine(10, 10, { town: { type: "MARKET", populationTier: "TOWN", name: "Bryn" } });
/** The town's 8-tile support ring, all garrisoned and empty. */
const ring = (overrides: Record<string, Record<string, unknown>> = {}): Tile[] => {
  const tiles: Tile[] = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
    if (dx || dy) tiles.push(mine(10 + dx, 10 + dy, overrides[`${10 + dx},${10 + dy}`]));
  }
  return tiles;
};

const state = (tiles: Tile[], food: { supply: number; demand: number }, manpower = 1000, techIds: string[] = []) => {
  const s = createInitialState();
  s.me = "me";
  s.manpower = manpower;
  s.manpowerCap = 2000;
  s.homeTile = { x: 10, y: 10 };
  s.techIds = techIds;
  s.resourceSlots = { supply: { FOOD: food.supply, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 }, demand: { FOOD: food.demand, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0 } };
  s.tiles = new Map(tiles.map((t) => [`${t.x},${t.y}`, t]));
  return s;
};
const short = { supply: 3, demand: 8 };
const afc = mine(20, 10, { afc: { ownerId: "me", status: "active" } });
const shortage = (s: ReturnType<typeof state>) => foodShortageForState(s, scanFoodSources(s));

// Playtest 2026-11-19: 8 FOOD used against 3 produced, and the player couldn't tell what to do.
describe("tracker FOOD shortage", () => {
  it("is hidden when FOOD supply covers demand", () => {
    const s = state([town, ...ring(), afc], { supply: 8, demand: 8 });
    expect(foodShortageForState(s, scanFoodSources(s))).toBeUndefined();
    expect(nextStepScanForState(s).food).toBeUndefined();
  });

  it("lists the fixes cheapest first: garrison, beacon to food outside reach, then Farm Plots", () => {
    const s = state([
      town, ...ring(),
      mine(13, 10, { resource: "FARM", ownershipState: "FRONTIER" }),
      mine(12, 12, { resource: "FISH", ownershipState: "FRONTIER" }),
      tile(14, 14, { resource: "FISH" }),
      afc
    ], short);
    const food = shortage(s);
    expect(food?.short).toBe(5);
    const steps = foodShortageSteps(food!);
    expect(steps.map((step) => step.title)).toEqual(["Garrison grain", "Relay Beacon to fish", "Build 6 Farm Plots (8 plots free)"]);
    expect(steps[0]).toMatchObject({ sub: "+1 FOOD · 2 in reach", focus: { x: 13, y: 10 } });
    expect(steps[1]).toMatchObject({ sub: "+2 FOOD · 8 tiles out · outside reach", beacon: { x: 14, y: 14 } });
    expect(foodShortageHtml(food!, true)).toContain('data-hud-v2-beacon="RELAY_BEACON" data-hud-v2-beacon-x="14" data-hud-v2-beacon-y="14"');
    expect(steps[2]).toMatchObject({ sub: "150 MP · +1 FOOD each · Bryn", plots: { x: 10, y: 10, count: 6 } });
  });

  // Owner call 2026-11-20: food in reach -> claim and garrison it; outside reach -> a Relay Beacon toward it.
  it("says expand for unowned food inside your reach, and prefers it to a beacon", () => {
    const s = state([town, ...ring(), tile(12, 11, { resource: "FISH" }), tile(14, 14, { resource: "FARM" }), afc], short);
    const steps = foodShortageSteps(shortage(s)!);
    expect(steps[0]).toMatchObject({ title: "Expand to fish", sub: "+2 FOOD · then garrison", focus: { x: 12, y: 11 } });
    expect(steps.some((step) => step.title.startsWith("Relay Beacon"))).toBe(false);
  });

  it("shows food outside reach without a tap target when no beacon can go down", () => {
    const food = { ...shortage(state([town, ...ring(), tile(14, 14, { resource: "FISH" }), afc], short))!, beaconReady: false };
    expect(foodShortageSteps(food)[0]).toEqual({ title: "Fish outside reach", sub: "+2 FOOD · 8 tiles out · needs a Relay Beacon", focus: { x: 14, y: 14 } });
    expect(foodShortageHtml(food, true)).not.toContain("data-hud-v2-beacon");
  });

  // Review of #2903: a live beacon button with too little MP opens a placement the server refuses.
  it("doesn't offer the beacon with less manpower than it costs", () => {
    const tiles = [town, ...ring(), tile(14, 14, { resource: "FISH" }), afc];
    expect(shortage(state(tiles, short))!.beaconReady).toBe(true);
    expect(shortage(state(tiles, short, 1))!.beaconReady).toBe(false);
  });

  it("offers the drone only when no grain or fish is known nearby", () => {
    const far = tile(10 + FOOD_NEARBY_TILES + 1, 10, { resource: "FARM" });
    const steps = foodShortageSteps(shortage(state([town, ...ring(), far, afc], short))!);
    expect(steps.map((step) => step.title)).toEqual(["Scout for food", "Build 6 Farm Plots (8 plots free)"]);
    expect(steps[0]?.focus).toEqual({ x: 20, y: 10 });
    const near = foodShortageSteps(shortage(state([town, ...ring(), tile(12, 10, { resource: "FARM" }), afc], short))!);
    expect(near.some((step) => step.title === "Scout for food")).toBe(false);
    // An AFC that isn't active can't launch the drone (review of #2881).
    const idleAfc = mine(20, 10, { afc: { ownerId: "me", status: "inactive" } });
    expect(foodShortageSteps(shortage(state([town, ...ring(), far, idleAfc], short))!).some((step) => step.title === "Scout for food")).toBe(false);
  });

  it("counts only plots a Farm Plot can take, and caps the queue at the manpower on hand", () => {
    const tiles = [town, ...ring({
      "9,9": { economicStructure: { type: "MANUFACTORY", ownerId: "me", status: "active" } },
      "10,9": { resource: "FARM" },
      "11,9": { ownershipState: "FRONTIER" }
    })];
    expect(shortage(state(tiles, short, 1000))?.plotTown?.free).toBe(5);
    expect(shortage(state(tiles, short, 1000))?.plotsToQueue).toBe(5);
    expect(shortage(state(tiles, short, 320))?.plotsToQueue).toBe(2);
    // Short of one plot's manpower: the build row is refused below its cost, so nothing to queue (review of #2881).
    const poor = shortage(state(tiles, short, 10))!;
    expect(poor.plotsToQueue).toBe(0);
    expect(foodShortageSteps(poor).at(-1)).toEqual({ title: "Farm Plots (5 plots free)", sub: "Need 150 MP · +1 FOOD each" });
    expect(foodShortageHtml(poor, true)).not.toContain("data-hud-v2-food-plots");
    // A queued build already holds its plot.
    const queued = state(tiles, short);
    queued.developmentQueue = [{ kind: "BUILD", x: 11, y: 10, tileKey: "11,10", label: "Build", optimisticKind: "FARM_PLOT", payload: { type: "BUILD_STRUCTURE", x: 11, y: 10, structureType: "FARM_PLOT" } }] as typeof queued.developmentQueue;
    expect(shortage(queued)?.plotTown?.free).toBe(4);
  });

  it("drops the Farm Plot row when no town has a free plot", () => {
    const full = ring(Object.fromEntries(ring().map((t) => [`${t.x},${t.y}`, { economicStructure: { type: "FARM_PLOT", ownerId: "me", status: "active" } }])));
    expect(foodShortageSteps(shortage(state([town, ...full, afc], short))!).map((step) => step.title)).toEqual(["Scout for food"]);
  });

  it("uses the yield the player can build once Hyperfeed is commissioned", () => {
    const s = state([town, ...ring(), mine(12, 10, { resource: "FARM", ownershipState: "FRONTIER" }), tile(14, 10, { resource: "FISH" })], short, 1000, [FARM_PLOT_UPGRADE_TECH_ID]);
    const steps = foodShortageSteps(shortage(s)!);
    expect(steps[0]?.sub).toBe("+1 FOOD · 3 with Hydrogarden");
    // Hyperfeed (agriculture) also adds +1 on every fish tile (review of #2881).
    expect(steps[1]?.sub).toBe("+3 FOOD · 4 tiles out · outside reach");
    expect(steps.at(-1)?.sub).toBe("150 MP · +1 FOOD each, 3 upgraded · Bryn");
  });

  it("is one header in Next step, unfolding into the rows", () => {
    const food = shortage(state([town, ...ring(), afc], short))!;
    const base: TrackerInput = { buildSlots: { busy: 3, limit: 3 }, afcReady: 0, flags: [], flagCap: 0, manpowerCap: 2000, building: [], queue: [], slotsOpen: false, waypoints: [], nowMs: 0 };
    const folded = trackerHtml({ ...base, food, foodOpen: false });
    expect(folded).toContain("Next step");
    expect(folded).toContain("Short 5 FOOD");
    expect(folded).toContain("data-hud-v2-food-toggle");
    expect(folded).not.toContain("Scout for food");
    const open = trackerHtml({ ...base, food, foodOpen: true });
    expect(open).toContain("Scout for food");
    expect(open).toContain(`data-hud-v2-food-plots="10,10" data-hud-v2-food-plots-count="6"`);
    expect(open.indexOf("Scout for food")).toBeLessThan(open.indexOf("plots free"));
    expect(foodShortageHtml(food, false)).not.toMatch(/→/);
    expect(trackerHtml(base)).not.toContain("Next step");
    expect(trackerSummaryHtml({ ...base, food })).toContain(`title="Short 5 FOOD">Next ›`);
  });
});
