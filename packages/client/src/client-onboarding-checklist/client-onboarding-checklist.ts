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
//   2. Expand To the town — garrison a TOWN-or-higher tile. Also satisfied
//      if the player's own starting SETTLEMENT-tier tile (every new empire
//      spawns with one, free) happens to have grown to TOWN tier on its
//      own in the meantime.
//   3. Find food tiles — enough known FARM/FISH tiles (owned or not, in
//      reach or not) to reach the food-slot target once claimed.
//   4. Expand To food tiles — garrison enough FARM/FISH tiles to hit
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
// points the player at building a RELAY_BEACON to push reach out instead --
// highlighting the best tile to build it on (client-relay-beacon-site.ts),
// aimed at the blocked town/food target.
// Reappears as many times as needed -- once reach grows to cover a target,
// the checklist resumes whichever goal was blocked.
//
// TOWN, CITY, GREAT_CITY and METROPOLIS satisfy the garrisoned-town goal.
// Once fully done, the checklist is marked complete in account-scoped
// storage and never shown again. Highlights point at objectives, not paths.

import { tileKey } from "@border-empires/shared";
import type { Tile } from "../client-types.js";
import { townIdentityForTile } from "../client-town-identity.js";
import { computeLocalReachSet } from "../client-reach-overlay/client-reach-overlay.js";
import { bestRelayBeaconSites } from "../client-relay-beacon-site/client-relay-beacon-site.js";
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
  /** During EXPAND_RELAY_BEACON: the tile to build the beacon on (also in highlightTiles), when the player has one. */
  relayBeaconSite?: { x: number; y: number };
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

/** Best tile for a Relay Beacon that pushes reach toward `targets` (or, with none known, toward the most new ground). */
const relayBeaconSiteToward = (
  tiles: ReadonlyMap<string, Tile>,
  playerId: string,
  reach: ReadonlySet<string>,
  targets: readonly { x: number; y: number }[]
): { x: number; y: number } | undefined => {
  const [site] = bestRelayBeaconSites(tiles, playerId, { reach, targets, limit: 1 });
  return site ? { x: site.x, y: site.y } : undefined;
};

// The best site can be the player's own town tile itself -- don't ring it twice.
const withSite = (anchors: Array<{ x: number; y: number }>, site: { x: number; y: number } | undefined): Array<{ x: number; y: number }> =>
  site && !anchors.some((a) => a.x === site.x && a.y === site.y) ? [...anchors, site] : anchors;

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
  const withinReach = (t: { x: number; y: number }): boolean => {
    const key = tileKey(t.x, t.y);
    const tile = tiles.get(key);
    return Boolean(tile && reach.has(key) && (!tile.reachOwnerId || tile.reachOwnerId === playerId));
  };
  const inReach = (t: { x: number; y: number }): boolean => withinReach(t) && !tiles.get(tileKey(t.x, t.y))?.optimisticPending;
  const pendingInReach = (candidates: readonly { x: number; y: number }[]): boolean =>
    candidates.some((t) => withinReach(t) && Boolean(tiles.get(tileKey(t.x, t.y))?.optimisticPending));

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
    // OUTPOST_STRUCTURE_TYPES) instead, which extends reach outward until a
    // town falls inside it. ownTownTierAnchors is always empty on this
    // branch (no town-tier town yet), so the beacon site is the only
    // highlight -- without it a new player was told to build a beacon with
    // nothing on the map saying where.
    if (pendingInReach(captureTownCandidates)) {
      return {
        step: "EXPAND_TOWN",
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
    const site = relayBeaconSiteToward(tiles, playerId, reach, captureTownCandidates);
    return {
      step: "EXPAND_RELAY_BEACON",
      townFound,
      townExpanded: false,
      foodFound,
      foodSlotsFound,
      foodExpanded,
      foodSlotsClaimed,
      foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
      highlightTiles: withSite(ownTownTierAnchors, site),
      ...(site ? { relayBeaconSite: site } : {})
    };
  }

  if (!foodExpanded) {
    const reachableFoodCandidates = foodCandidates.filter(inReach);
    if (reachableFoodCandidates.length === 0) {
      // Same "nothing actually reachable yet" case as above, now for food.
      const pending = pendingInReach(foodCandidates);
      const site = pending ? undefined : relayBeaconSiteToward(tiles, playerId, reach, foodCandidates);
      return {
        step: pending ? "EXPAND_FOOD" : "EXPAND_RELAY_BEACON",
        townFound: true,
        townExpanded: true,
        foodFound,
        foodSlotsFound,
        foodExpanded,
        foodSlotsClaimed,
        foodSlotsTarget: ONBOARDING_FOOD_SLOTS_TARGET,
        highlightTiles: withSite(ownTownTierAnchors, site),
        ...(site ? { relayBeaconSite: site } : {})
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
