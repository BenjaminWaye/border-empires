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
  it("weights owned FARM as 1 slot and FISH as 2 slots (structure-slots.ts's RESOURCE_SLOT_SPEC), ignoring other resources and other owners", () => {
    const tiles = [
      { resource: "FARM", ownerId: ME }, // 1 slot
      { resource: "FISH", ownerId: ME }, // 2 slots
      { resource: "TITANIUM", ownerId: ME },
      { resource: "FARM", ownerId: "player-2" },
      { resource: "FARM" }
    ];
    expect(foodSlotsClaimedByPlayer(tiles, ME)).toBe(3);
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
    expect(state.townFound).toBe(false);
    expect(state.townExpanded).toBe(false);
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
    // "Find a town" is done (a candidate is known) even though "Expand To
    // it" isn't yet -- the two are tracked separately.
    expect(state.townFound).toBe(true);
    expect(state.townExpanded).toBe(false);
  });

  it("reports the real foodSlotsClaimed total even while still on EXPAND_TOWN, not a hardcoded 0", () => {
    // A player can end up owning food tiles (e.g. captured via ATTACK)
    // before finishing the town goal -- foodSlotsClaimed must reflect that,
    // not silently read 0 while foodExpanded/foodFound reflect the real
    // total (which would make the panel show a checked food-expanded box
    // next to "0/4 food slots" text).
    const tiles = tilesMap([
      ownTown(0, 0, "SETTLEMENT"),
      tile(2, 0, { town: { type: "MARKET", populationTier: "TOWN" } as never }),
      tile(1, 0, { resource: "FISH", ownerId: ME }), // 2 slots, already owned
      tile(1, 1, { resource: "FISH", ownerId: ME }) // 2 slots, already owned -- 4 total
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_TOWN");
    expect(state.foodSlotsClaimed).toBe(4);
    expect(state.foodExpanded).toBe(true);
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
    // Still "found" (known to exist) even though it's out of reach to expand to.
    expect(state.townFound).toBe(true);
    expect(state.townExpanded).toBe(false);
  });

  it("reports the real foodSlotsClaimed total on the out-of-reach EXPAND_RELAY_BEACON branch too, not a hardcoded 0", () => {
    // Same as the reachable-town regression test above, but for the
    // out-of-reach-town branch specifically (a second, differently-indented
    // hardcoded `foodSlotsClaimed: 0` slipped through the first fix here).
    const tiles = tilesMap([
      ownTown(0, 0, "SETTLEMENT"),
      tile(10, 0, { town: { type: "MARKET", populationTier: "TOWN" } as never }), // out of reach
      tile(1, 0, { resource: "FISH", ownerId: ME }), // 2 slots, already owned
      tile(1, 1, { resource: "FISH", ownerId: ME }) // 2 slots, already owned -- 4 total
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
    expect(state.foodSlotsClaimed).toBe(4);
    expect(state.foodExpanded).toBe(true);
  });

  it("moves to EXPAND_FOOD once a TOWN-tier town is owned, highlighting the town plus reachable unclaimed food tiles", () => {
    const tiles = tilesMap([
      ownTown(5, 5),
      tile(6, 5, { resource: "FARM" }), // 1 slot
      tile(7, 5, { resource: "FISH" }), // 2 slots -- combined with the FARM tile, 3 known slots is still short of the 4 target
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
    expect(state.townFound).toBe(true);
    expect(state.townExpanded).toBe(true);
    // Only 1 (FARM) + 2 (FISH) = 3 known slots, short of the 4-slot target.
    expect(state.foodFound).toBe(false);
    expect(state.foodExpanded).toBe(false);
  });

  it("marks food as found once enough known food tiles (weighted) reach the target, even before any are claimed", () => {
    const tiles = tilesMap([
      ownTown(5, 5),
      tile(6, 5, { resource: "FISH" }), // 2 slots
      tile(7, 5, { resource: "FISH" }) // 2 slots -- 4 known slots total, meets the target
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.foodFound).toBe(true);
    expect(state.foodExpanded).toBe(false);
  });

  it("only TOWN tier satisfies the town-expanded goal -- CITY tier does not count", () => {
    const tiles = tilesMap([ownTown(9, 9, "CITY")]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).not.toBe("EXPAND_FOOD");
    expect(state.townExpanded).toBe(false);
  });

  it("reaches DONE once 4+ weighted food slots are claimed (any mix of grain/fish)", () => {
    const tiles = tilesMap([
      ownTown(0, 0),
      tile(1, 0, { resource: "FARM", ownerId: ME }), // 1
      tile(2, 0, { resource: "FARM", ownerId: ME }), // 1
      tile(3, 0, { resource: "FARM", ownerId: ME }), // 1
      tile(4, 0, { resource: "FISH", ownerId: ME }) // 2 -- 5 slots total, past the 4 target
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("DONE");
    expect(state.foodSlotsClaimed).toBe(5);
    expect(state.highlightTiles).toEqual([]);
    expect(state.foodFound).toBe(true);
    expect(state.foodExpanded).toBe(true);
  });

  it("a single owned FISH tile (2 slots) plus 2 owned FARM tiles (1 each) reaches the 4-slot target exactly", () => {
    const tiles = tilesMap([
      ownTown(0, 0),
      tile(1, 0, { resource: "FISH", ownerId: ME }), // 2
      tile(2, 0, { resource: "FARM", ownerId: ME }), // 1
      tile(3, 0, { resource: "FARM", ownerId: ME }) // 1 -- 4 total
    ]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.foodSlotsClaimed).toBe(4);
    expect(state.foodExpanded).toBe(true);
    expect(state.step).toBe("DONE");
  });

  it("moves to EXPAND_RELAY_BEACON instead of EXPAND_FOOD when no unclaimed food tile is reachable, highlighting the town as a beacon-siting anchor", () => {
    const tiles = tilesMap([ownTown(5, 5), tile(8, 5, { resource: "TITANIUM" })]);
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.highlightTiles).toEqual([{ x: 5, y: 5 }]);
    // The town goals stay done even though `step` reads EXPAND_RELAY_BEACON
    // -- it's blocking the food goals here, not the (already-done) town
    // ones. A checklist UI rendering all 4 goals as checkboxes needs this
    // to tell them apart (see OnboardingChecklistState's doc comment).
    expect(state.townFound).toBe(true);
    expect(state.townExpanded).toBe(true);
  });

  it("stays DONE (no highlights) once completion has been persisted, even if the underlying tiles regress", () => {
    const tiles = tilesMap([tile(0, 0)]);
    completeOnboardingChecklist({
      step: "DONE",
      townFound: true,
      townExpanded: true,
      foodFound: true,
      foodSlotsFound: 4,
      foodExpanded: true,
      foodSlotsClaimed: 4,
      foodSlotsTarget: 4,
      highlightTiles: []
    });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("DONE");
    expect(state.highlightTiles).toEqual([]);
  });

  it("completeOnboardingChecklist is a no-op when the step isn't DONE", () => {
    const tiles = tilesMap([tile(0, 0)]);
    completeOnboardingChecklist({
      step: "EXPAND_TOWN",
      townFound: false,
      townExpanded: false,
      foodFound: false,
      foodSlotsFound: 0,
      foodExpanded: false,
      foodSlotsClaimed: 0,
      foodSlotsTarget: 4,
      highlightTiles: []
    });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).not.toBe("DONE");
  });
});
