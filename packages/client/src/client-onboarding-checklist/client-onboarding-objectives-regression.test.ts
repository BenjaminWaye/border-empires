// @vitest-environment happy-dom
import { beforeEach, expect, it } from "vitest";
import type { Tile } from "../client-types.js";
import { foodSlotsClaimedByPlayer, onboardingChecklistState } from "./client-onboarding-checklist.js";

const world = (): Map<string, Tile> => new Map([
  ["5,5", { x: 5, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "SETTLED", afc: { ownerId: "me", status: "active" } }],
  ["6,5", { x: 6, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER" }],
  ["7,5", { x: 7, y: 5, terrain: "LAND", ownerId: "me", ownershipState: "FRONTIER", resource: "FISH" }],
  ["5,6", { x: 5, y: 6, terrain: "LAND", townType: "MARKET", townPopulationTier: "TOWN" }],
  ["8,5", { x: 8, y: 5, terrain: "LAND", resource: "FISH" }]
]);
const ownTown = (tiles: Map<string, Tile>): void => {
  Object.assign(tiles.get("5,6")!, { ownerId: "me", ownershipState: "SETTLED" });
};
beforeEach(() => window.localStorage.clear());

it("preserves town-first guidance and highlights the actual town rather than a path", () => {
  const tiles = world();
  const state = onboardingChecklistState(tiles, "me");
  expect(state.step).toBe("EXPAND_TOWN");
  expect(state.highlightTiles).toEqual([{ x: 5, y: 6 }]);
  expect(state.foodSlotsClaimed).toBe(0);
});

it("highlights frontier food itself, never the ordinary frontier tile before it", () => {
  const tiles = world();
  ownTown(tiles);
  const state = onboardingChecklistState(tiles, "me");
  expect(state.step).toBe("EXPAND_FOOD");
  expect(state.highlightTiles).toContainEqual({ x: 7, y: 5 });
  expect(state.highlightTiles).toContainEqual({ x: 8, y: 5 });
  expect(state.highlightTiles).not.toContainEqual({ x: 6, y: 5 });
  expect(state.foodFound).toBe(true);
  expect(state.foodExpanded).toBe(false);
});

it.each(["CITY", "GREAT_CITY", "METROPOLIS"] as const)("recognizes lightweight %s town identity", (tier) => {
  const tiles = world();
  ownTown(tiles);
  tiles.get("5,6")!.townPopulationTier = tier;
  expect(onboardingChecklistState(tiles, "me").townExpanded).toBe(true);
});

it("does not offer an enemy town as an Expand To objective", () => {
  const tiles = world();
  tiles.get("5,6")!.ownerId = "enemy";
  const state = onboardingChecklistState(tiles, "me");
  expect(state.townFound).toBe(false);
  expect(state.highlightTiles).not.toContainEqual({ x: 5, y: 6 });
  // The only highlight is where to build a Relay Beacon, never the enemy town.
  expect(state.highlightTiles).toEqual(state.relayBeaconSite ? [state.relayBeaconSite] : []);
});

it("keeps pending food discovered but neither actionable nor counted as usable slots", () => {
  const tiles = world();
  ownTown(tiles);
  Object.assign(tiles.get("7,5")!, { ownershipState: "SETTLED", optimisticPending: "settle" });
  const state = onboardingChecklistState(tiles, "me");
  expect(state.foodFound).toBe(true);
  expect(state.foodSlotsClaimed).toBe(0);
  expect(state.highlightTiles).not.toContainEqual({ x: 7, y: 5 });
  delete tiles.get("7,5")!.optimisticPending;
  expect(foodSlotsClaimedByPlayer(tiles.values(), "me")).toBe(2);
});

it("does not finish the town objective or highlight it while its garrison is pending", () => {
  const tiles = world();
  Object.assign(tiles.get("5,6")!, { ownerId: "me", ownershipState: "FRONTIER", optimisticPending: "settle" });
  const state = onboardingChecklistState(tiles, "me");
  expect(state.townFound).toBe(true);
  expect(state.townExpanded).toBe(false);
  expect(state.step).toBe("EXPAND_TOWN");
  expect(state.highlightTiles).toEqual([]);
});

it("does not advise a beacon when the only in-reach food is already being garrisoned", () => {
  const tiles = world();
  ownTown(tiles);
  tiles.get("8,5")!.resource = "TITANIUM";
  tiles.get("7,5")!.optimisticPending = "settle";
  const state = onboardingChecklistState(tiles, "me");
  expect(state.step).toBe("EXPAND_FOOD");
  expect(state.highlightTiles).toEqual([{ x: 5, y: 6 }]);
  expect(state.foodSlotsClaimed).toBe(0);
});

it("does not highlight food controlled by rival reach", () => {
  const tiles = world();
  ownTown(tiles);
  tiles.get("7,5")!.reachOwnerId = "enemy";
  expect(onboardingChecklistState(tiles, "me").highlightTiles).not.toContainEqual({ x: 7, y: 5 });
});
