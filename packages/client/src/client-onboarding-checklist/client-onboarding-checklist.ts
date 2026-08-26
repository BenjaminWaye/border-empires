// New-player onboarding checklist: a two-step goal shown until a fresh
// empire is food-secure.
//
//   1. SETTLE_TOWN — settle a tile into your first town.
//   2. SECURE_FOOD — claim 4 food slots (FARM "grain" and/or FISH tiles,
//      any mix) toward the ~4 food slots a town needs to stay powered/fed
//      (see resource-slot-view.ts §5.3, townFoodSlotDemandForTier).
//
// Each step highlights its own tiles on the map until satisfied: the
// player's town while step 1 is open, then unclaimed FARM/FISH tiles while
// step 2 is open. The checklist is for brand-new empires only (gated by
// `me` owning zero towns before step 1 starts) and, once both steps are
// done, is marked complete in storage and never shown again.

import type { Tile } from "../client-types.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";

export const ONBOARDING_FOOD_SLOTS_TARGET = 4;

export type OnboardingChecklistStep = "SETTLE_TOWN" | "SECURE_FOOD" | "DONE";

export type OnboardingChecklistState = {
  step: OnboardingChecklistStep;
  foodSlotsClaimed: number;
  foodSlotsTarget: number;
  /** Tile coordinates the map should highlight for the current step. Empty once step is DONE. */
  highlightTiles: Array<{ x: number; y: number }>;
};

const isFoodResource = (resource: string | undefined): boolean => resource === "FARM" || resource === "FISH";

/**
 * Count of FARM/FISH tiles this player owns — the live "food slots claimed"
 * total for step 2, summed across grain and fish (no separate quota per
 * resource kind).
 */
export const foodSlotsClaimedByPlayer = (tiles: Iterable<Pick<Tile, "resource" | "ownerId">>, playerId: string): number => {
  let count = 0;
  for (const tile of tiles) {
    if (tile.ownerId === playerId && isFoodResource(tile.resource)) count += 1;
  }
  return count;
};

/**
 * Derives the current onboarding checklist state from the client's tiles.
 * Returns step "DONE" (no highlights) once the checklist has been
 * completed and persisted, or once both steps are actually satisfied this
 * session (callers should then call `completeOnboardingChecklist`).
 */
export const onboardingChecklistState = (
  tiles: Iterable<Pick<Tile, "x" | "y" | "resource" | "ownerId" | "town">>,
  playerId: string,
  authEmail?: string | null
): OnboardingChecklistState => {
  if (isOnboardingChecklistCompleted(authEmail)) {
    return { step: "DONE", foodSlotsClaimed: ONBOARDING_FOOD_SLOTS_TARGET, foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET, highlightTiles: [] };
  }

  const ownTowns: Array<{ x: number; y: number }> = [];
  const foodCandidates: Array<{ x: number; y: number }> = [];
  let foodSlotsClaimed = 0;

  for (const tile of tiles) {
    if (tile.ownerId === playerId && tile.town) ownTowns.push({ x: tile.x, y: tile.y });
    if (isFoodResource(tile.resource)) {
      if (tile.ownerId === playerId) foodSlotsClaimed += 1;
      else if (!tile.ownerId) foodCandidates.push({ x: tile.x, y: tile.y });
    }
  }

  if (ownTowns.length === 0) {
    return { step: "SETTLE_TOWN", foodSlotsClaimed: 0, foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET, highlightTiles: [] };
  }

  if (foodSlotsClaimed < ONBOARDING_FOOD_SLOTS_TARGET) {
    // Keep the town highlighted alongside the food candidates: it's the
    // player's anchor point for "claim food tiles near here" until step 2
    // is satisfied too.
    return {
      step: "SECURE_FOOD",
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: [...ownTowns, ...foodCandidates]
    };
  }

  return { step: "DONE", foodSlotsClaimed, foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET, highlightTiles: [] };
};

/** Persists checklist completion once both steps are satisfied, so it stays gone for this account. */
export const completeOnboardingChecklist = (state: OnboardingChecklistState, authEmail?: string | null): void => {
  if (state.step === "DONE") markOnboardingChecklistCompleted(authEmail);
};
