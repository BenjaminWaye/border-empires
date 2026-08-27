// New-player onboarding checklist: a goal shown until a fresh empire is
// food-secure. The whole checklist is EXPAND-driven -- see
// docs/game-mechanics.md §4: SETTLE only ever finalizes a tile the player
// already owns as FRONTIER (from a prior EXPAND), and the client's "Expand
// To" action (client-tile-action-neutral.ts's "settle_land") auto-settles
// once ownership lands, so from the player's point of view there's exactly
// one verb here: find a target tile in reach, then Expand To it.
//
// The panel shows 4 goal checkboxes, "find" split out from "expand to" for
// both the town and the food targets:
//   1. Find a town — a town tile that isn't already the player's own is
//      known to exist somewhere (almost always one of the neutral towns
//      world gen pre-seeded, since zero towns are player-founded -- see
//      docs/game-mechanics.md §2), regardless of whether it's in reach yet.
//   2. Expand To the town — actually own a TOWN-tier tile. Also satisfied
//      if the player's own starting SETTLEMENT-tier tile (every new empire
//      spawns with one, free) happens to have grown to TOWN tier on its
//      own in the meantime.
//   3. Find food tiles — enough known FARM/FISH tiles (owned or not, in
//      reach or not) to reach the food-slot target once claimed.
//   4. Expand To food tiles — actually own enough FARM/FISH tiles to hit
//      ONBOARDING_FOOD_SLOTS_TARGET food *slots* (not tiles: a FISH tile is
//      worth 2 slots, a FARM tile 1 -- see structure-slots.ts's
//      RESOURCE_SLOT_SPEC, `FARM: baseSlots: 1` / `FISH: baseSlots: 2` --
//      so "4 slots" is any weighted mix, e.g. 4 grain, 2 fish, or 1 fish +
//      2 grain).
//
// `step`/`highlightTiles` drive the single actionable "do this next" the
// map highlights, separate from the 4 checkboxes above: EXPAND_TOWN or
// EXPAND_FOOD when there's an in-*reach* target to point at (this actually
// computes the player's local reach set, the same math
// client-reach-overlay.ts's map overlay uses -- not just "known to the
// client at all"), or EXPAND_RELAY_BEACON when there isn't one yet, which
// points the player at building a RELAY_BEACON to push reach out instead.
// Reappears as many times as needed -- once reach grows to cover a target,
// the checklist resumes whichever goal was blocked.
//
// The checklist is for brand-new empires only (gated by `me` owning no
// TOWN-tier tile before goal 1 starts -- CITY/GREAT_CITY/METROPOLIS aren't
// checked for since the checklist has already moved past goal 2 by the
// time a town could grow that far) and, once fully done, is marked
// complete in storage and never shown again.

import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";

export const ONBOARDING_FOOD_SLOTS_TARGET = 4;

export type OnboardingChecklistStep = "EXPAND_TOWN" | "EXPAND_FOOD" | "EXPAND_RELAY_BEACON" | "DONE";

export type OnboardingChecklistState = {
  step: OnboardingChecklistStep;
  /** True once a town tile that isn't the player's own is known to exist (or the player already owns one -- see townExpanded). */
  townFound: boolean;
  /** True once the player owns a TOWN-tier tile. */
  townExpanded: boolean;
  /** True once enough known FARM/FISH tiles (owned or not) exist to reach `foodSlotsTarget` once claimed. */
  foodFound: boolean;
  /** True once `foodSlotsClaimed >= foodSlotsTarget`. */
  foodExpanded: boolean;
  /** Weighted food slots the player currently owns (FARM = 1 slot, FISH = 2 -- see structure-slots.ts's RESOURCE_SLOT_SPEC), not a tile count. */
  foodSlotsClaimed: number;
  foodSlotsTarget: number;
  /** Tile coordinates the map should highlight for the current step. Empty once step is DONE. */
  highlightTiles: Array<{ x: number; y: number }>;
};

const FOOD_SLOTS_BY_RESOURCE: Record<string, number> = { FARM: 1, FISH: 2 };

const foodSlotsForResource = (resource: string | undefined): number => (resource ? (FOOD_SLOTS_BY_RESOURCE[resource] ?? 0) : 0);

/**
 * Weighted food slots this player owns — the live "food slots claimed"
 * total for the food goals. A FISH tile is worth 2 slots, a FARM tile 1
 * (structure-slots.ts's RESOURCE_SLOT_SPEC), not a flat 1 per tile.
 */
export const foodSlotsClaimedByPlayer = (tiles: Iterable<Pick<Tile, "resource" | "ownerId">>, playerId: string): number => {
  let slots = 0;
  for (const tile of tiles) {
    if (tile.ownerId === playerId) slots += foodSlotsForResource(tile.resource);
  }
  return slots;
};

/**
 * Derives the current onboarding checklist state from the client's tiles.
 * Takes the full tiles map (not just an iterable of values) because
 * highlighting an EXPAND_TOWN/EXPAND_FOOD target requires knowing it's
 * actually within the player's current reach -- computeLocalReachSet needs
 * keyed lookups, same as the map's own reach-boundary overlay.
 *
 * Returns step "DONE" (no highlights) once the checklist has been
 * completed and persisted, or once all 4 goals are actually satisfied this
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
      townFound: true,
      townExpanded: true,
      foodFound: true,
      foodExpanded: true,
      foodSlotsClaimed: ONBOARDING_FOOD_SLOTS_TARGET,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: []
    };
  }

  const ownTowns: Array<{ x: number; y: number }> = [];
  const foodCandidates: Array<{ x: number; y: number; slots: number }> = [];
  const captureTownCandidates: Array<{ x: number; y: number }> = [];
  let foodSlotsClaimed = 0;
  let hasTownTierTown = false;

  for (const tile of tiles.values()) {
    if (tile.town) {
      if (tile.ownerId === playerId) {
        ownTowns.push({ x: tile.x, y: tile.y });
        // Only TOWN itself satisfies the town-expanded goal, not
        // CITY/GREAT_CITY/METROPOLIS, since that goal is done and dusted
        // the moment the player reaches TOWN and the checklist never
        // re-checks it once the food goals have started.
        if (tile.town.populationTier === "TOWN") hasTownTierTown = true;
      } else {
        // A neutral or enemy town -- an EXPAND_TOWN target, not something to
        // "claim" like a bare resource tile. Zero towns are player-founded
        // (docs/game-mechanics.md §2), so this is effectively "every town
        // the player doesn't already own."
        captureTownCandidates.push({ x: tile.x, y: tile.y });
      }
    }
    const slots = foodSlotsForResource(tile.resource);
    if (slots > 0) {
      if (tile.ownerId === playerId) foodSlotsClaimed += slots;
      else if (!tile.ownerId) foodCandidates.push({ x: tile.x, y: tile.y, slots });
    }
  }

  const townFound = hasTownTierTown || captureTownCandidates.length > 0;
  const foodKnownSlots = foodSlotsClaimed + foodCandidates.reduce((sum, c) => sum + c.slots, 0);
  const foodFound = foodKnownSlots >= ONBOARDING_FOOD_SLOTS_TARGET;
  const foodExpanded = foodSlotsClaimed >= ONBOARDING_FOOD_SLOTS_TARGET;

  const reach = computeLocalReachSet(tiles, playerId);
  const inReach = (t: { x: number; y: number }): boolean => reach.has(tileKey(t.x, t.y));

  if (!hasTownTierTown) {
    const reachableTownCandidates = captureTownCandidates.filter(inReach);
    if (reachableTownCandidates.length > 0) {
      return {
        step: "EXPAND_TOWN",
        townFound,
        townExpanded: false,
        foodFound,
        foodExpanded,
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
      townFound,
      townExpanded: false,
      foodFound,
      foodExpanded,
      foodSlotsClaimed: 0,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: ownTowns
    };
  }

  if (!foodExpanded) {
    const reachableFoodCandidates = foodCandidates.filter(inReach);
    if (reachableFoodCandidates.length === 0) {
      // Same "nothing actually reachable yet" case as above, now for food.
      return {
        step: "EXPAND_RELAY_BEACON",
        townFound: true,
        townExpanded: true,
        foodFound,
        foodExpanded,
        foodSlotsClaimed,
        foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
        highlightTiles: ownTowns
      };
    }
    // Keep the town highlighted alongside the food candidates: it's the
    // player's anchor point for "expand to food tiles near here" until
    // the food goals are satisfied too.
    return {
      step: "EXPAND_FOOD",
      townFound: true,
      townExpanded: true,
      foodFound,
      foodExpanded,
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: [...ownTowns, ...reachableFoodCandidates.map(({ x, y }) => ({ x, y }))]
    };
  }

  return {
    step: "DONE",
    townFound: true,
    townExpanded: true,
    foodFound: true,
    foodExpanded: true,
    foodSlotsClaimed,
    foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
    highlightTiles: []
  };
};

/** Persists checklist completion once all 4 goals are satisfied, so it stays gone for this account. */
export const completeOnboardingChecklist = (state: OnboardingChecklistState, authEmail?: string | null): void => {
  if (state.step === "DONE") markOnboardingChecklistCompleted(authEmail);
};
