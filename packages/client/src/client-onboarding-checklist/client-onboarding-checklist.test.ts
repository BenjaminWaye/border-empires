// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { completeOnboardingChecklist, foodSlotsClaimedByPlayer, onboardingChecklistState } from "./client-onboarding-checklist.js";

const ME = "player-1";
const world = (): Map<string, Tile> => {
  const tiles = new Map<string, Tile>();
  for (let y = 0; y <= 12; y += 1) for (let x = 0; x <= 12; x += 1) tiles.set(`${x},${y}`, { x, y, terrain: "LAND" } as Tile);
  Object.assign(tiles.get("5,5")!, { ownerId: ME, ownershipState: "SETTLED", afc: { ownerId: ME, status: "active" } });
  tiles.get("7,5")!.resource = "FISH";
  tiles.get("8,5")!.resource = "FISH";
  Object.assign(tiles.get("10,5")!, { townType: "MARKET", townName: "Emberwatch", townPopulationTier: "TOWN" });
  return tiles;
};
const settleFood = (tiles: Map<string, Tile>): void => {
  for (const key of ["7,5", "8,5"]) Object.assign(tiles.get(key)!, { ownerId: ME, ownershipState: "SETTLED" });
};
beforeEach(() => window.localStorage.clear());

describe("opening expedition", () => {
  it("uses the AFC's reach and directs the player to one food route before the town", () => {
    const state = onboardingChecklistState(world(), ME);
    expect(state.step).toBe("EXPAND_FOOD");
    expect(state.highlightTiles).toEqual([{ x: 6, y: 5 }]);
    expect(state.guidance).toContain("fishing grounds (7, 5) — 2 land steps away");
    expect(state.foodFound).toBe(true);
    expect(state.townFound).toBe(true);
    expect(state.foodSlotsClaimed).toBe(0);
  });
  it("changes to a named town route when four settled food slots are secured", () => {
    const tiles = world();
    settleFood(tiles);
    // Ordinary ownership does not extend reach. A beacon connects the
    // second objective once food is secured.
    expect(onboardingChecklistState(tiles, ME).step).toBe("EXPAND_RELAY_BEACON");
    Object.assign(tiles.get("8,6")!, { ownerId: ME, ownershipState: "SETTLED", economicStructure: { ownerId: ME, type: "RELAY_BEACON", status: "active" } });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.step).toBe("EXPAND_TOWN");
    expect(state.foodSlotsClaimed).toBe(4);
    expect(state.guidance).toContain("Emberwatch (10, 5)");
    expect(state.highlightTiles).toEqual([{ x: 9, y: 5 }]);
  });
  it("does not treat frontier food as usable supply and instructs settling it", () => {
    const tiles = world();
    Object.assign(tiles.get("7,5")!, { ownerId: ME, ownershipState: "FRONTIER" });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.foodSlotsClaimed).toBe(0);
    expect(state.guidance).toMatch(/^Garrison/);
    expect(state.highlightTiles).toEqual([{ x: 7, y: 5 }]);
  });
  it("does not direct actions through a still-resolving expansion", () => {
    const tiles = world();
    Object.assign(tiles.get("6,5")!, { ownerId: ME, ownershipState: "FRONTIER", optimisticPending: "expand" });
    const pending = onboardingChecklistState(tiles, ME);
    expect(pending.highlightTiles).toEqual([]);
    expect(pending.foodFound).toBe(true);
    expect(pending.guidance).toContain("Wait for it to finish");
    settleFood(tiles);
    tiles.get("7,5")!.optimisticPending = "settle";
    expect(foodSlotsClaimedByPlayer(tiles.values(), ME)).toBe(2);
  });
  it.each(["CITY", "GREAT_CITY", "METROPOLIS"] as const)("recognizes a settled %s from its lightweight identity", (tier) => {
    const tiles = world();
    settleFood(tiles);
    Object.assign(tiles.get("10,5")!, { ownerId: ME, ownershipState: "SETTLED", townPopulationTier: tier });
    expect(onboardingChecklistState(tiles, ME).step).toBe("DONE");
  });
  it("does not complete the town goal before settlement finishes", () => {
    const tiles = world();
    settleFood(tiles);
    Object.assign(tiles.get("10,5")!, { ownerId: ME, ownershipState: "FRONTIER", reachOwnerId: ME });
    const state = onboardingChecklistState(tiles, ME);
    expect(state.townExpanded).toBe(false);
  });
  it("never labels an enemy town as an easy expansion objective", () => {
    const tiles = world();
    settleFood(tiles);
    tiles.get("10,5")!.ownerId = "enemy";
    const state = onboardingChecklistState(tiles, ME);
    expect(state.townFound).toBe(false);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
  });
  it.each(["SEA", "MOUNTAIN"] as const)("does not direct a player to food across %s", (terrain) => {
    const tiles = world();
    for (let y = 0; y <= 12; y += 1) tiles.get(`6,${y}`)!.terrain = terrain;
    const state = onboardingChecklistState(tiles, ME);
    expect(state.foodFound).toBe(false);
    expect(state.highlightTiles).toEqual([]);
    expect(state.step).toBe("EXPAND_RELAY_BEACON");
  });
  it("does not recommend a next tile claimed by rival reach", () => {
    const tiles = world();
    for (let y = 0; y <= 12; y += 1) tiles.get(`6,${y}`)!.reachOwnerId = "enemy";
    expect(onboardingChecklistState(tiles, ME).highlightTiles).toEqual([]);
  });
  it("weights settled fish and farms and ignores frontier, enemy and non-food resources", () => {
    const tiles = world();
    settleFood(tiles);
    Object.assign(tiles.get("4,5")!, { resource: "FARM", ownerId: ME, ownershipState: "SETTLED" });
    Object.assign(tiles.get("4,6")!, { resource: "FARM", ownerId: ME, ownershipState: "FRONTIER" });
    expect(foodSlotsClaimedByPlayer(tiles.values(), ME)).toBe(5);
  });
  it("persists completion only when food and a settled town are both secured", () => {
    const tiles = world();
    completeOnboardingChecklist(onboardingChecklistState(tiles, ME), "a@example.com");
    expect(onboardingChecklistState(tiles, ME, "a@example.com").step).not.toBe("DONE");
    settleFood(tiles);
    Object.assign(tiles.get("10,5")!, { ownerId: ME, ownershipState: "SETTLED" });
    completeOnboardingChecklist(onboardingChecklistState(tiles, ME), "a@example.com");
    expect(onboardingChecklistState(new Map(), ME, "a@example.com").step).toBe("DONE");
    expect(onboardingChecklistState(new Map(), ME, "b@example.com").step).not.toBe("DONE");
  });
});
