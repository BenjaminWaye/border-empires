// Existing town-first checklist: highlight objectives directly, never route tiles.
import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { isOnboardingChecklistCompleted, markOnboardingChecklistCompleted } from "./client-onboarding-checklist-storage.js";

export const ONBOARDING_FOOD_SLOTS_TARGET = 4;

export type OnboardingChecklistStep = "EXPAND_TOWN" | "EXPAND_FOOD" | "EXPAND_RELAY_BEACON" | "DONE";

export type OnboardingChecklistState = {
  step: OnboardingChecklistStep;
  /** True once a town tile that isn't the player's own is known to exist (or the player already owns one -- see townExpanded). */
  townFound: boolean;
  /** True once the player has garrisoned a TOWN-or-higher tile. */
  townExpanded: boolean;
  /** True once `foodSlotsFound >= foodSlotsTarget`. */
  foodFound: boolean;
  /** True once `foodSlotsClaimed >= foodSlotsTarget`. */
  foodExpanded: boolean;
  /** Weighted food slots known to exist (owned FARM/FISH tiles plus unclaimed candidates, capped at foodSlotsTarget for display) -- the "Find food tiles" goal's progress counter. */
  foodSlotsFound: number;
  /** Weighted food slots the player has garrisoned (FARM = 1 slot, FISH = 2 -- see structure-slots.ts's RESOURCE_SLOT_SPEC), not a tile count. */
  foodSlotsClaimed: number;
  foodSlotsTarget: number;
  /** Tile coordinates the map should highlight for the current step. Empty once step is DONE. */
  highlightTiles: Array<{ x: number; y: number }>;
};

const FOOD_SLOTS_BY_RESOURCE: Record<string, number> = { FARM: 1, FISH: 2 };

const foodSlotsForResource = (resource: string | undefined): number => (resource ? (FOOD_SLOTS_BY_RESOURCE[resource] ?? 0) : 0);

/**
 * Weighted garrisoned food slots this player owns — the live "food slots claimed"
 * total for the food goals. A FISH tile is worth 2 slots, a FARM tile 1
 * (structure-slots.ts's RESOURCE_SLOT_SPEC), not a flat 1 per tile.
 */
export const foodSlotsClaimedByPlayer = (tiles: Iterable<Pick<Tile, "resource" | "ownerId" | "ownershipState" | "optimisticPending">>, playerId: string): number => {
  let slots = 0;
  for (const tile of tiles) {
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && !tile.optimisticPending) slots += foodSlotsForResource(tile.resource);
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
      foodSlotsFound: ONBOARDING_FOOD_SLOTS_TARGET,
      foodExpanded: true,
      foodSlotsClaimed: ONBOARDING_FOOD_SLOTS_TARGET,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: []
    };
  }

  // Anchor tiles used to highlight "build/expand near here" -- deliberately
  // excludes the player's free starting SETTLEMENT-tier tile (townPopulationTier
  // "SETTLEMENT", see season-seed-world.ts's townPopulationTier: only the
  // player's own spawn tile, marked isSettlement, ever gets that tier --
  // every world-gen-placed town starts well above POPULATION_TOWN_MIN and
  // is never SETTLEMENT tier). Highlighting the player's own spawn point as
  // if it were a target read as a bug, not an anchor.
  const ownTownTierAnchors: Array<{ x: number; y: number }> = [];
  const foodCandidates: Array<{ x: number; y: number; slots: number }> = [];
  const captureTownCandidates: Array<{ x: number; y: number }> = [];
  let foodSlotsClaimed = 0;
  let hasTownTierTown = false;

  for (const tile of tiles.values()) {
    const town = townIdentityForTile(tile);
    if (town && town.populationTier !== "SETTLEMENT") {
      if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && !tile.optimisticPending) {
        hasTownTierTown = true;
        ownTownTierAnchors.push({ x: tile.x, y: tile.y });
      } else if (!tile.ownerId || tile.ownerId === playerId) {
        captureTownCandidates.push({ x: tile.x, y: tile.y });
      }
    }
    const slots = foodSlotsForResource(tile.resource);
    if (slots > 0) {
      if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && !tile.optimisticPending) foodSlotsClaimed += slots;
      else if (!tile.ownerId || tile.ownerId === playerId) foodCandidates.push({ x: tile.x, y: tile.y, slots });
    }
  }

  const townFound = hasTownTierTown || captureTownCandidates.length > 0;
  const foodKnownSlots = foodSlotsClaimed + foodCandidates.reduce((sum, c) => sum + c.slots, 0);
  const foodSlotsFound = Math.min(foodKnownSlots, ONBOARDING_FOOD_SLOTS_TARGET);
  const foodFound = foodKnownSlots >= ONBOARDING_FOOD_SLOTS_TARGET;
  const foodExpanded = foodSlotsClaimed >= ONBOARDING_FOOD_SLOTS_TARGET;

  const reach = computeLocalReachSet(tiles, playerId);
  const inReach = (t: { x: number; y: number }): boolean => {
    const key = tileKey(t.x, t.y);
    const tile = tiles.get(key);
    return Boolean(tile && !tile.optimisticPending && reach.has(key) && (!tile.reachOwnerId || tile.reachOwnerId === playerId));
  };

  if (!hasTownTierTown) {
    const reachableTownCandidates = captureTownCandidates.filter(inReach);
    if (reachableTownCandidates.length > 0) {
      return {
        step: "EXPAND_TOWN",
        townFound,
        townExpanded: false,
        foodFound,
        foodSlotsFound,
        foodExpanded,
        foodSlotsClaimed,
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
      foodSlotsFound,
      foodExpanded,
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: ownTownTierAnchors
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
        foodSlotsFound,
        foodExpanded,
        foodSlotsClaimed,
        foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
        highlightTiles: ownTownTierAnchors
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
      foodSlotsFound,
      foodExpanded,
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: [...ownTownTierAnchors, ...reachableFoodCandidates.map(({ x, y }) => ({ x, y }))]
    };
  }

  return {
    step: "DONE",
    townFound: true,
    townExpanded: true,
    foodFound: true,
    foodSlotsFound: ONBOARDING_FOOD_SLOTS_TARGET,
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
