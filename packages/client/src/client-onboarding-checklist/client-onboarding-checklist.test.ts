import { beforeEach, describe, expect, it, vi } from "vitest";
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import {
  ONBOARDING_FOOD_SLOTS_TARGET,
  completeOnboardingChecklist,
  foodSlotsClaimedByPlayer,
  onboardingChecklistState
} from "./client-onboarding-checklist.js";

const stubWindowStorage = (): Map<string, string> => {
  const storage = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key)
    }
  });
  return storage;
};

const ME = "player-1";

type TestTile = Pick<Tile, "x" | "y" | "resource" | "ownerId" | "town" | "terrain" | "ownershipState">;

// exactOptionalPropertyTypes forbids `field: undefined` on optional Tile
// properties, so tests build tiles piece by piece instead of a literal
// with explicit undefineds. Defaults to LAND terrain so every tile
// participates in the reach-disk BFS (computeLocalReachSet) the same way a
// real loaded tile would.
const tile = (x: number, y: number, extra: Partial<TestTile> = {}): TestTile => ({ x, y, terrain: "LAND", ...extra });

// An owned town anchor needs ownershipState: "SETTLED" to count as a live
// reach anchor (computeLocalReachSet's isSettled gate) -- a bare
// `{ ownerId, town }` tile (as a real FRONTIER-not-yet-settled tile would
// look) contributes no reach at all.
const ownTown = (x: number, y: number, populationTier: NonNullable<Tile["town"]>["populationTier"] = "TOWN"): TestTile =>
  tile(x, y, { ownerId: ME, ownershipState: "SETTLED", town: { type: "FARMING", populationTier } as never });

const tilesMap = (tiles: TestTile[]): ReadonlyMap<string, Tile> => {
  const map = new Map<string, Tile>();
  for (const t of tiles) map.set(tileKey(t.x, t.y), t as Tile);
  return map;
};

describe("foodSlotsClaimedByPlayer", () => {
  it("counts owned FARM and FISH tiles, ignoring other resources and other owners", () => {
    const tiles = [
      { resource: "FARM", ownerId: ME },
      { resource: "FISH", ownerId: ME },
      { resource: "TITANIUM", ownerId: ME },
      { resource: "FARM", ownerId: "player-2" },
      { resource: "FARM" }
    ];
    expect(foodSlotsClaimedByPlayer(tiles, ME)).toBe(2);
  });
});

describe("onboardingChecklistState", () => {
  beforeEach(() => {
    stubWindowStorage();
  });

  it("falls back to EXPAND_RELAY_BEACON with no highlights when the player owns nothing at all yet (no reach anchor)", () => {
    const tiles = tilesMap([tile(1, 1, { resource: "FARM" })]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.highlightTiles).toEqual([]);
  });

  it("stays on EXPAND_TOWN, highlighting a reachable neutral town, until the player owns a TOWN-tier town", () => {
    const tiles = tilesMap([
      // Player's own starting SETTLEMENT (settled, so it's a live reach
      // anchor) plus a neutral town just inside its radius-3 reach.
      ownTown(0, 0, "SETTLEMENT"),
      tile(2, 0, { town: { type: "MARKET", populationTier: "TOWN" } as never })
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_TOWN");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.highlightTiles).toEqual([{ x: 2, y: 0 }]);
  });

  it("moves to EXPAND_RELAY_BEACON instead of EXPAND_TOWN when a neutral town exists but is outside reach", () => {
    const tiles = tilesMap([
      ownTown(0, 0, "SETTLEMENT"),
      // Radius-3 reach from (0,0) tops out at 3 tiles away; this one is 10.
      tile(10, 0, { town: { type: "MARKET", populationTier: "TOWN" } as never })
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
    expect(state.highlightTiles).toEqual([{ x: 0, y: 0 }]);
  });

  it("moves to EXPAND_FOOD once a TOWN-tier town is owned, highlighting the town plus reachable unclaimed food tiles", () => {
    const tiles = tilesMap([
      ownTown(5, 5),
      tile(6, 5, { resource: "FARM" }),
      tile(7, 5, { resource: "FISH" }),
      tile(8, 5, { resource: "TITANIUM" })
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_FOOD");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.foodSlotsTarget).toBe(ONBOARDING_FOOD_SLOTS_TARGET);
    expect(state.highlightTiles).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 7, y: 5 }
    ]);
  });

  it("only TOWN tier satisfies step 1 -- CITY tier does not count", () => {
    const tiles = tilesMap([ownTown(9, 9, "CITY")]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).not.toBe("EXPAND_FOOD");
  });

  it("reaches DONE once 4 food slots are claimed (any mix of grain/fish)", () => {
    const tiles = tilesMap([
      ownTown(0, 0),
      tile(1, 0, { resource: "FARM", ownerId: ME }),
      tile(2, 0, { resource: "FARM", ownerId: ME }),
      tile(3, 0, { resource: "FARM", ownerId: ME }),
      tile(4, 0, { resource: "FISH", ownerId: ME })
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("DONE");
    expect(state.foodSlotsClaimed).toBe(4);
    expect(state.highlightTiles).toEqual([]);
  });

  it("moves to EXPAND_RELAY_BEACON instead of EXPAND_FOOD when no unclaimed food tile is reachable, highlighting the town as a beacon-siting anchor", () => {
    const tiles = tilesMap([ownTown(5, 5), tile(8, 5, { resource: "TITANIUM" })]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.highlightTiles).toEqual([{ x: 5, y: 5 }]);
  });

  it("stays DONE (no highlights) once completion has been persisted, even if the underlying tiles regress", () => {
    const tiles = tilesMap([tile(0, 0)]);
    completeOnboardingChecklist({ step: "DONE", foodSlotsClaimed: 4, foodSlotsTarget: 4, highlightTiles: [] });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("DONE");
    expect(state.highlightTiles).toEqual([]);
  });

  it("completeOnboardingChecklist is a no-op when the step isn't DONE", () => {
    const tiles = tilesMap([tile(0, 0)]);
    completeOnboardingChecklist({ step: "EXPAND_TOWN", foodSlotsClaimed: 0, foodSlotsTarget: 4, highlightTiles: [] });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).not.toBe("DONE");
  });
});
