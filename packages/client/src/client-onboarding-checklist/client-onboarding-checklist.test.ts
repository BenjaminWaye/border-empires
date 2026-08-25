import { beforeEach, describe, expect, it, vi } from "vitest";
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

type TestTile = Pick<Tile, "x" | "y" | "resource" | "ownerId" | "town">;

// exactOptionalPropertyTypes forbids `field: undefined` on optional Tile
// properties, so tests build tiles piece by piece instead of a literal
// with explicit undefineds.
const tile = (x: number, y: number, extra: Partial<TestTile> = {}): TestTile => ({ x, y, ...extra });

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

  it("stays on SETTLE_TOWN with no highlights until the player owns a town", () => {
    const tiles = [tile(1, 1, { resource: "FARM" })];
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("SETTLE_TOWN");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.highlightTiles).toEqual([]);
  });

  it("moves to SECURE_FOOD once a town is owned, highlighting the town plus unclaimed food tiles", () => {
    const tiles = [
      tile(5, 5, { ownerId: ME, town: { type: "FARMING" } as never }),
      tile(6, 5, { resource: "FARM" }),
      tile(7, 5, { resource: "FISH" }),
      tile(8, 5, { resource: "TITANIUM" })
    ];
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("SECURE_FOOD");
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.foodSlotsTarget).toBe(ONBOARDING_FOOD_SLOTS_TARGET);
    expect(state.highlightTiles).toEqual([
      { x: 5, y: 5 },
      { x: 6, y: 5 },
      { x: 7, y: 5 }
    ]);
  });

  it("reaches DONE once 4 food slots are claimed (any mix of grain/fish)", () => {
    const tiles = [
      tile(0, 0, { ownerId: ME, town: { type: "FARMING" } as never }),
      tile(1, 0, { resource: "FARM", ownerId: ME }),
      tile(2, 0, { resource: "FARM", ownerId: ME }),
      tile(3, 0, { resource: "FARM", ownerId: ME }),
      tile(4, 0, { resource: "FISH", ownerId: ME })
    ];
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("DONE");
    expect(state.foodSlotsClaimed).toBe(4);
    expect(state.highlightTiles).toEqual([]);
  });

  it("stays DONE (no highlights) once completion has been persisted, even if the underlying tiles regress", () => {
    const tiles = [tile(0, 0)];
    completeOnboardingChecklist({ step: "DONE", foodSlotsClaimed: 4, foodSlotsTarget: 4, highlightTiles: [] });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("DONE");
    expect(state.highlightTiles).toEqual([]);
  });

  it("completeOnboardingChecklist is a no-op when the step isn't DONE", () => {
    const tiles = [tile(0, 0)];
    completeOnboardingChecklist({ step: "SETTLE_TOWN", foodSlotsClaimed: 0, foodSlotsTarget: 4, highlightTiles: [] });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("SETTLE_TOWN");
  });
});
