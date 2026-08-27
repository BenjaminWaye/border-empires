// New-player onboarding checklist: a two-step goal shown until a fresh
// empire is food-secure.
//
//   1. SETTLE_TOWN — grow your starting SETTLEMENT-tier tile (every new
//      empire spawns with one, free) to exactly TOWN tier. A bare SETTLEMENT
//      does not count: it's handed to the player, not settled by them.
//   2. SECURE_FOOD — claim 4 food slots (FARM "grain" and/or FISH tiles,
//      any mix) toward the ~4 food slots a town needs to stay powered/fed
//      (see resource-slot-view.ts §5.3, townFoodSlotDemandForTier).
//
// A third step, EXPAND_REACH, can appear in place of SECURE_FOOD: if there's
// no unclaimed FARM/FISH tile AND no capturable town (neutral or enemy)
// known at all, neither "claim a food tile" nor "capture a town" is an
// actionable objective yet, so the checklist instead points the player at
// building a RELAY_BEACON to push their reach out until one of those falls
// inside it. If a capturable town is known but no food tile is, that town
// stays highlighted alongside SECURE_FOOD instead -- there's still
// something to go do.
//
// Each step highlights its own tiles on the map until satisfied: the
// player's SETTLEMENT tile(s) while step 1 is open, then the player's towns
// plus unclaimed FARM/FISH tiles plus any capturable town while step 2 is
// open (or just the player's towns, as beacon-siting anchors, for
// EXPAND_REACH). The checklist is for
// brand-new empires only (gated by `me` owning no TOWN-tier tile before
// step 1 starts -- CITY/GREAT_CITY/METROPOLIS aren't checked for since the
// checklist has already moved past step 1 by the time a town could grow
// that far) and, once both steps are done, is marked complete in storage
// and never shown again.

import type { Tile } from "../client-types.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";

export const ONBOARDING_FOOD_SLOTS_TARGET = 4;

export type OnboardingChecklistStep = "SETTLE_TOWN" | "SECURE_FOOD" | "EXPAND_REACH" | "DONE";

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
  const ownSettlements: Array<{ x: number; y: number }> = [];
  const foodCandidates: Array<{ x: number; y: number }> = [];
  const captureTownCandidates: Array<{ x: number; y: number }> = [];
  let foodSlotsClaimed = 0;
  let hasTownTierTown = false;

  for (const tile of tiles) {
    if (tile.town) {
      if (tile.ownerId === playerId) {
        ownTowns.push({ x: tile.x, y: tile.y });
        // Every new empire spawns with a free SETTLEMENT-tier tile, so a
        // SETTLEMENT alone doesn't satisfy "find your first town" — the
        // player still has to grow it (or settle elsewhere) to TOWN tier.
        // Only TOWN itself counts here, not CITY/GREAT_CITY/METROPOLIS, since
        // this step is done and dusted the moment the player reaches TOWN
        // and the checklist never re-checks it once step 2 has started.
        if (tile.town.populationTier === "TOWN") hasTownTierTown = true;
        else if (tile.town.populationTier === "SETTLEMENT") ownSettlements.push({ x: tile.x, y: tile.y });
      } else {
        // A neutral or enemy town -- a capture target, not something to
        // "claim" like a bare resource tile. Counts toward "is there
        // anything actionable nearby" alongside food candidates below.
        captureTownCandidates.push({ x: tile.x, y: tile.y });
      }
    }
    if (isFoodResource(tile.resource)) {
      if (tile.ownerId === playerId) foodSlotsClaimed += 1;
      else if (!tile.ownerId) foodCandidates.push({ x: tile.x, y: tile.y });
    }
  }

  if (!hasTownTierTown) {
    return { step: "SETTLE_TOWN", foodSlotsClaimed: 0, foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET, highlightTiles: ownSettlements };
  }

  if (foodSlotsClaimed < ONBOARDING_FOOD_SLOTS_TARGET) {
    // Neither an unclaimed FARM/FISH tile nor a capturable town is known at
    // all -- the player's starting reach doesn't cover anything actionable,
    // so "go claim a food tile" (or "go capture that town") isn't a real
    // objective yet. Point them at building a RELAY_BEACON (an
    // outpost-family structure -- see client-reach-overlay.ts's
    // OUTPOST_STRUCTURE_TYPES) instead, which extends reach outward from an
    // owned tile until a claimable food tile or town falls inside it.
    if (foodCandidates.length === 0 && captureTownCandidates.length === 0) {
      return {
        step: "EXPAND_REACH",
        foodSlotsClaimed,
        foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
        highlightTiles: ownTowns
      };
    }
    // Keep the town highlighted alongside the food candidates (and any
    // nearby capturable town) -- the player's anchor point for "claim food
    // tiles near here" until step 2 is satisfied too.
    return {
      step: "SECURE_FOOD",
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: [...ownTowns, ...foodCandidates, ...captureTownCandidates]
    };
  }

  return { step: "DONE", foodSlotsClaimed, foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET, highlightTiles: [] };
};

/** Persists checklist completion once both steps are satisfied, so it stays gone for this account. */
export const completeOnboardingChecklist = (state: OnboardingChecklistState, authEmail?: string | null): void => {
  if (state.step === "DONE") markOnboardingChecklistCompleted(authEmail);
};
