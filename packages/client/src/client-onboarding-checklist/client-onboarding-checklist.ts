// Food first, then a settled town. FRONTIER food does not supply slots,
// and enemy towns are not EXPAND targets.
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { onboardingRoutes, type OnboardingRoute } from "./client-onboarding-route.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";

export const ONBOARDING_FOOD_SLOTS_TARGET = 4;
export type OnboardingChecklistStep = "EXPAND_TOWN" | "EXPAND_FOOD" | "EXPAND_RELAY_BEACON" | "DONE";
export type OnboardingChecklistState = {
  step: OnboardingChecklistStep;
  townFound: boolean;
  townExpanded: boolean;
  foodFound: boolean;
  foodExpanded: boolean;
  foodSlotsFound: number;
  foodSlotsClaimed: number;
  foodSlotsTarget: number;
  highlightTiles: Array<{ x: number; y: number }>;
  guidance: string;
};

const foodSlots = (resource: string | undefined): number => resource === "FARM" ? 1 : resource === "FISH" ? 2 : 0;

export const foodSlotsClaimedByPlayer = (
  tiles: Iterable<Pick<Tile, "resource" | "ownerId" | "ownershipState" | "optimisticPending">>, playerId: string
): number => {
  let slots = 0;
  for (const tile of tiles) if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.optimisticPending !== "settle") slots += foodSlots(tile.resource);
  return slots;
};

export const onboardingChecklistState = (
  tiles: ReadonlyMap<string, Tile>, playerId: string, authEmail?: string | null
): OnboardingChecklistState => {
  const completed: OnboardingChecklistState = {
    step: "DONE", townFound: true, townExpanded: true, foodFound: true, foodExpanded: true,
    foodSlotsFound: ONBOARDING_FOOD_SLOTS_TARGET, foodSlotsClaimed: ONBOARDING_FOOD_SLOTS_TARGET,
    foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET, highlightTiles: [], guidance: "Four food slots secured. Your town adds manpower and reach. Explore for a waystation, dock or strategic resource next. Click the flag to continue."
  };
  if (isOnboardingChecklistCompleted(authEmail)) return completed;
  const routes = onboardingRoutes(tiles, playerId);
  const reach = computeLocalReachSet(tiles, playerId);
  const canAct = (tile: Tile): boolean => tile.optimisticPending !== "expand" && tile.optimisticPending !== "settle" && reach.has(tileKey(tile.x, tile.y)) && (!tile.reachOwnerId || tile.reachOwnerId === playerId);
  let townExpanded = false;
  let townFound = false;
  let pendingTown = false;
  let pendingFood = false;
  const towns: OnboardingRoute[] = [];
  const foods: OnboardingRoute[] = [];
  let knownFood = 0;
  const claimedFood = foodSlotsClaimedByPlayer(tiles.values(), playerId);
  for (const tile of tiles.values()) {
    const town = townIdentityForTile(tile);
    if (town && tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.optimisticPending !== "expand" && tile.optimisticPending !== "settle" && town.populationTier !== "SETTLEMENT") townExpanded = true;
    const route = routes.get(tileKey(tile.x, tile.y));
    if (!route) continue;
    const actionable = canAct(route.next ?? tile);
    const pending = [route.next, tile].some((part) => part?.optimisticPending === "expand" || part?.optimisticPending === "settle");
    if (town && (!tile.ownerId || (tile.ownerId === playerId && tile.ownershipState === "FRONTIER"))) {
      townFound = true;
      pendingTown ||= pending;
      if (actionable) towns.push(route);
    }
    const slots = foodSlots(tile.resource);
    if (slots && !(tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.optimisticPending !== "settle") && (!tile.ownerId || tile.ownerId === playerId)) {
      knownFood += slots;
      pendingFood ||= pending;
      if (actionable) foods.push(route);
    }
  }
  const foodExpanded = claimedFood >= ONBOARDING_FOOD_SLOTS_TARGET;
  const foodSlotsFound = Math.min(ONBOARDING_FOOD_SLOTS_TARGET, claimedFood + knownFood);
  const state: OnboardingChecklistState = {
    step: "EXPAND_RELAY_BEACON", townFound: townExpanded || townFound, townExpanded,
    foodFound: foodSlotsFound >= ONBOARDING_FOOD_SLOTS_TARGET, foodExpanded,
    foodSlotsFound, foodSlotsClaimed: claimedFood, foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
    highlightTiles: [], guidance: "Expand and garrison land near your border, then build a Relay Beacon to reveal the next goal. Your first five beacons need no food slots."
  };
  if (townExpanded && foodExpanded) return { ...completed, foodSlotsClaimed: claimedFood };
  const candidates = !foodExpanded ? foods : towns;
  candidates.sort((a, b) => a.steps - b.steps || a.target.y - b.target.y || a.target.x - b.target.x);
  const target = candidates[0];
  if (!target) return (foodExpanded ? pendingTown : pendingFood)
    ? { ...state, step: foodExpanded ? "EXPAND_TOWN" : "EXPAND_FOOD", guidance: "Your expansion or garrison is underway. Wait for it to finish; the next step will update automatically." }
    : state;
  const next = target.next ?? target.target;
  if (!canAct(next)) return state;
  const name = foodExpanded ? (townIdentityForTile(target.target)?.name ?? "the town") : (target.target.resource === "FISH" ? "fishing grounds" : "farmland");
  const steps = target.steps;
  const action = next.ownerId === playerId ? "Garrison" : "Expand To";
  return {
    ...state, step: foodExpanded ? "EXPAND_TOWN" : "EXPAND_FOOD",
    highlightTiles: [{ x: next.x, y: next.y }],
    guidance: `${action} the highlighted tile toward ${name} (${target.target.x}, ${target.target.y})${steps ? ` — ${steps} land steps away` : ""}. ${foodExpanded ? "Garrison the town to grow your manpower and reach." : "Garrison food tiles to supply building and town growth."}`
  };
};

export const completeOnboardingChecklist = (state: OnboardingChecklistState, authEmail?: string | null): void => {
  if (state.step === "DONE") markOnboardingChecklistCompleted(authEmail);
};
