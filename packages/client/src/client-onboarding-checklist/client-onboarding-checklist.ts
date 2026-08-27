// New-player onboarding checklist: a goal shown until a fresh empire is
// food-secure. The whole checklist is EXPAND-driven -- see
// docs/game-mechanics.md §4: SETTLE only ever finalizes a tile the player
// already owns as FRONTIER (from a prior EXPAND), and the client's "Expand
// To" action (client-tile-action-neutral.ts's "settle_land") auto-settles
// once ownership lands, so from the player's point of view there's exactly
// one verb here: find a target tile in reach, then Expand To it.
//
//   1. EXPAND_TOWN — find a town tile within reach that isn't already yours
//      (almost always one of the neutral towns world gen pre-seeded, since
//      zero towns are player-founded -- see docs/game-mechanics.md §2) and
//      Expand To it. Also satisfied if the player's own starting
//      SETTLEMENT-tier tile (every new empire spawns with one, free)
//      happens to have grown to TOWN tier on its own in the meantime.
//   2. EXPAND_FOOD — claim 4 food slots (FARM "grain" and/or FISH tiles,
//      any mix) toward the ~4 food slots a town needs to stay powered/fed
//      (see resource-slot-view.ts §5.3, townFoodSlotDemandForTier), the
//      same way: find one in reach, Expand To it.
//
// A third step, EXPAND_RELAY_BEACON, can appear in place of either: if
// there's no in-*reach* town/food target to point at (not just none known
// to the client at all -- this actually computes the player's local reach
// set, the same math client-reach-overlay.ts's map overlay uses), then
// "find one and expand to it" isn't an actionable objective yet, so the
// checklist instead points the player at building a RELAY_BEACON to push
// reach out until a target falls inside it. Reappears as many times as
// needed -- once reach grows to cover a target, the checklist resumes
// whichever of step 1/2 was blocked.
//
// Each step highlights its own tiles on the map until satisfied. The
// checklist is for brand-new empires only (gated by `me` owning no
// TOWN-tier tile before step 1 starts -- CITY/GREAT_CITY/METROPOLIS aren't
// checked for since the checklist has already moved past step 1 by the
// time a town could grow that far) and, once both steps are done, is
// marked complete in storage and never shown again.

import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";

export const ONBOARDING_FOOD_SLOTS_TARGET = 4;

export type OnboardingChecklistStep = "EXPAND_TOWN" | "EXPAND_FOOD" | "EXPAND_RELAY_BEACON" | "DONE";

export type OnboardingChecklistState = {
  step: OnboardingChecklistStep;
  /**
   * True once the player owns a TOWN-tier tile. Tracked separately from
   * `step` because EXPAND_RELAY_BEACON is ambiguous on its own -- it can be
   * blocking either goal, so a checklist UI listing both goals with a
   * checkbox each needs this to know goal 1 is done even while `step` reads
   * EXPAND_RELAY_BEACON for goal 2.
   */
  townGoalDone: boolean;
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
 * Takes the full tiles map (not just an iterable of values) because
 * highlighting an EXPAND_TOWN/EXPAND_FOOD target requires knowing it's
 * actually within the player's current reach -- computeLocalReachSet needs
 * keyed lookups, same as the map's own reach-boundary overlay.
 *
 * Returns step "DONE" (no highlights) once the checklist has been
 * completed and persisted, or once both steps are actually satisfied this
 * session (callers should then call `completeOnboardingChecklist`).
 */
export const onboardingChecklistState = (
  tiles: ReadonlyMap<string, Tile>,
  playerId: string,
  authEmail?: string | null
): OnboardingChecklistState => {
  if (isOnboardingChecklistCompleted(authEmail)) {
    return {
      step: "DONE",
      townGoalDone: true,
      foodSlotsClaimed: ONBOARDING_FOOD_SLOTS_TARGET,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: []
    };
  }

  const ownTowns: Array<{ x: number; y: number }> = [];
  const foodCandidates: Array<{ x: number; y: number }> = [];
  const captureTownCandidates: Array<{ x: number; y: number }> = [];
  let foodSlotsClaimed = 0;
  let hasTownTierTown = false;

  for (const tile of tiles.values()) {
    if (tile.town) {
      if (tile.ownerId === playerId) {
        ownTowns.push({ x: tile.x, y: tile.y });
        // Only TOWN itself satisfies step 1, not CITY/GREAT_CITY/METROPOLIS,
        // since this step is done and dusted the moment the player reaches
        // TOWN and the checklist never re-checks it once step 2 has started.
        if (tile.town.populationTier === "TOWN") hasTownTierTown = true;
      } else {
        // A neutral or enemy town -- an EXPAND_TOWN target, not something to
        // "claim" like a bare resource tile. Zero towns are player-founded
        // (docs/game-mechanics.md §2), so this is effectively "every town
        // the player doesn't already own."
        captureTownCandidates.push({ x: tile.x, y: tile.y });
      }
    }
    if (isFoodResource(tile.resource)) {
      if (tile.ownerId === playerId) foodSlotsClaimed += 1;
      else if (!tile.ownerId) foodCandidates.push({ x: tile.x, y: tile.y });
    }
  }

  const reach = computeLocalReachSet(tiles, playerId);
  const inReach = (t: { x: number; y: number }): boolean => reach.has(tileKey(t.x, t.y));

  if (!hasTownTierTown) {
    const reachableTownCandidates = captureTownCandidates.filter(inReach);
    if (reachableTownCandidates.length > 0) {
      return {
        step: "EXPAND_TOWN",
        townGoalDone: false,
        foodSlotsClaimed: 0,
        foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
        highlightTiles: reachableTownCandidates
      };
    }
    // No town within actual reach (not just "none known") -- Expand To has
    // nothing to target yet. Point at building a RELAY_BEACON (an
    // outpost-family structure -- see client-reach-overlay.ts's
    // OUTPOST_STRUCTURE_TYPES) from the player's own anchor instead, which
    // extends reach outward until a town falls inside it.
    return {
      step: "EXPAND_RELAY_BEACON",
      townGoalDone: false,
      foodSlotsClaimed: 0,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: ownTowns
    };
  }

  if (foodSlotsClaimed < ONBOARDING_FOOD_SLOTS_TARGET) {
    const reachableFoodCandidates = foodCandidates.filter(inReach);
    if (reachableFoodCandidates.length === 0) {
      // Same "nothing actually reachable yet" case as above, now for food.
      return {
        step: "EXPAND_RELAY_BEACON",
        townGoalDone: true,
        foodSlotsClaimed,
        foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
        highlightTiles: ownTowns
      };
    }
    // Keep the town highlighted alongside the food candidates: it's the
    // player's anchor point for "expand to food tiles near here" until
    // step 2 is satisfied too.
    return {
      step: "EXPAND_FOOD",
      townGoalDone: true,
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: [...ownTowns, ...reachableFoodCandidates]
    };
  }

  return {
    step: "DONE",
    townGoalDone: true,
    foodSlotsClaimed,
    foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
    highlightTiles: []
  };
};

/** Persists checklist completion once both steps are satisfied, so it stays gone for this account. */
export const completeOnboardingChecklist = (state: OnboardingChecklistState, authEmail?: string | null): void => {
  if (state.step === "DONE") markOnboardingChecklistCompleted(authEmail);
};
