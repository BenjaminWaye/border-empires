// Food-slot relief: when a player is fully out of FOOD slots (demand ≥
// supply, nothing left over) and has no way to grow FOOD supply directly
// (no FARMSTEAD/WATERWORKS/GRANARY build available — chooseBestEconomicBuild
// found nothing), the AI was previously just stuck: every FOOD-consuming
// build stays illegal forever, RELAY_BEACON included (it costs its own FOOD
// slot once the built-in waiver is used up), so an AI that reaches this
// state can never expand its way out even though expansion — claiming a new
// FARM/FISH tile — is exactly what would fix the underlying shortage.
//
// The first two tiers of the fix are always DISABLE, never
// REMOVE_STRUCTURE/demolish: disabling (SET_CONVERTER_STRUCTURE_ENABLED,
// enabled: false) frees the FOOD slot just as completely as demolition does
// — a manually-disabled structure is excluded from demand contribution
// entirely, see buildDemandContributors's `inactiveReason !== "manual"`
// check — but is reversible (the AI, or a human, can flip it back on once
// FOOD has headroom again) and keeps the build itself intact. Demolition has
// no advantage over disabling here, so neither of the first two tiers ever
// picks a REMOVE_STRUCTURE target.
//
// Tier 1: the active RELAY_BEACON this player owns that would cost the
// *least* FOOD-producing reach to give up — see chooseLowValueBeaconToDisable.
//
// Tier 2: if no beacon exists at all, any other active FOOD-consuming
// structure — preferring one the dormancy system (resource-slot-view.ts)
// already flagged FOOD-dormant (already contributing zero effect, so
// disabling it costs nothing in current output), but falling back further to
// any active FOOD-consuming structure if none is dormant — see
// chooseFoodConsumingStructureToDisable.
//
// Tier 3: if neither tier above found anything, the shortage is coming
// entirely from town population itself (townFoodSlotDemandForTier in
// resource-slot-view.ts) — no structure exists to disable at all. The only
// remaining lever is UNCAPTURE_TILE ("Abandon Territory" in the client):
// releasing a town tile back to neutral removes 100% of that town's FOOD
// demand in one move, not just one slot's worth. Unlike tiers 1-2 this is
// NOT reversible the same way — the tile itself can only be reclaimed later
// via ordinary EXPAND/SETTLE, not flipped back on — so it only ever targets
// this player's least-developed eligible town (never the SETTLEMENT-tier
// capital, which handleUncaptureTileCommand refuses outright) and only when
// they own more than one. See chooseTownToAbandon.
//
// Tier 1a: chooseLowValueBeaconToDisable only ever frees a real FOOD slot
// when the player owns MORE than RELAY_BEACON_FREE_FOOD_SLOT_COUNT active
// beacons — the first N are permanently waived to 0 FOOD cost (§23.2's
// relayBeaconFoodSlotWaiverCount, applySlotWaivers in resource-slot-view.ts).
// At N or fewer, disabling any of them frees nothing: the AI would sacrifice
// a beacon's whole reach for zero relief and, since nothing in the planner
// ever re-enables a "manual"-disabled beacon on its own (see
// chooseManuallyDisabledBeaconToReenable below), that beacon then sits dead
// forever — a real production incident (ai-2/Sigrid, 2026-09-20: her only
// beacon got disabled by this exact path while she owned 1, gaining no FOOD
// relief and losing the only reach anchor covering a neutral settlement,
// leaving her frontier permanently valueless and her income pinned at the
// single-town floor). Below the waiver count, chooseLowValueBeaconToDisable
// now refuses to pick a target at all — see chooseLowValueBeaconToAbandon
// for what runs instead.
import {
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  tileKeysInReach,
  structureSlotRequirements,
  type ReachAnchor,
  type SlotStructureType
} from "@border-empires/shared";

import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

export type FoodSlotReliefPlan = { x: number; y: number; kind: "disable" | "abandon_town" | "abandon_beacon" };

/** A manually-disabled RELAY_BEACON this player owns, worth flipping back on. */
export type FoodSlotReenableTarget = { x: number; y: number };

/**
 * Picks the active RELAY_BEACON this player owns that costs the *least*
 * uniquely-held FOOD-producing reach to disable.
 *
 * A beacon's reach can overlap a TOWN's, a DOCK's, or another active
 * beacon's/siege outpost's — losing this one specific anchor doesn't cost
 * anything real if every FARM/FISH tile it reaches is *also* covered by one
 * of the player's other active anchors (that tile stays claimed either way,
 * see reassessBorderOnAnchorDeactivation in reach.ts). Only a FARM/FISH tile
 * this beacon is the *sole* anchor over is a genuine loss — disabling the
 * beacon risks that tile falling out of the border entirely if no rival
 * claims it first, which would actually shrink FOOD supply instead of
 * relieving it.
 *
 * Scores every active, non-manually-disabled beacon by
 * (uniquely-held FOOD tiles, uniquely-held other-valuable tiles) and picks
 * the minimum — ties broken by lowest x, then y for reproducibility. This
 * replaces an earlier all-or-nothing "reach box holds zero valuable tiles"
 * filter: requiring an exact zero left the AI with no candidate at all once
 * every owned beacon covered *something*, even when disabling the least
 * useful one would have cost nothing thanks to overlap with other anchors.
 */
const activeNonManualBeacons = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string
): TTile[] =>
  ownedTiles.filter((tile) => {
    const structure = tile.economicStructure;
    return structure && structure.ownerId === playerId && structure.type === "RELAY_BEACON" && structure.status === "active" && structure.inactiveReason !== "manual";
  });

/**
 * Scores every candidate beacon by (uniquely-held FOOD tiles, uniquely-held
 * other-valuable tiles) and returns the minimum — ties broken by lowest x,
 * then y for reproducibility. Shared by chooseLowValueBeaconToDisable and
 * chooseLowValueBeaconToAbandon: both want "the beacon that costs the least
 * reach to give up", they just differ in what command they emit for it.
 */
const pickLowestValueBeacon = <TTile extends AutomationPlannerTile>(
  beacons: readonly TTile[],
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile>
): TTile | undefined => {
  const coverCount = anchorCoverCount(ownedTiles, playerId);
  let best: { tile: TTile; foodLoss: number; otherLoss: number } | undefined;
  for (const tile of beacons) {
    const anchor: ReachAnchor = { x: tile.x, y: tile.y, ownerId: "", activatedAt: 0, kind: "OUTPOST" };
    let foodLoss = 0;
    let otherLoss = 0;
    for (const key of tileKeysInReach(anchor)) {
      if ((coverCount.get(key) ?? 0) > 1) continue; // covered by another of this player's anchors too — no loss
      const reachedTile = tilesByKey.get(key);
      if (!reachedTile) continue;
      if (reachedTile.resource === "FARM" || reachedTile.resource === "FISH") foodLoss += 1;
      else if (reachedTile.resource || reachedTile.dockId || reachedTile.town) otherLoss += 1;
    }
    if (
      !best ||
      foodLoss < best.foodLoss ||
      (foodLoss === best.foodLoss && otherLoss < best.otherLoss) ||
      (foodLoss === best.foodLoss && otherLoss === best.otherLoss && (tile.x < best.tile.x || (tile.x === best.tile.x && tile.y < best.tile.y)))
    ) {
      best = { tile, foodLoss, otherLoss };
    }
  }
  return best?.tile;
};

export const chooseLowValueBeaconToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile> | undefined
): FoodSlotReliefPlan | undefined => {
  if (!tilesByKey) return undefined;
  const beacons = activeNonManualBeacons(ownedTiles, playerId);
  // Below the waiver count, every one of these beacons already costs 0 FOOD
  // slots (see file header) — disabling one here would sacrifice its reach
  // for no relief at all, so this tier refuses to pick a target and defers
  // to chooseLowValueBeaconToAbandon instead.
  if (beacons.length === 0 || beacons.length <= RELAY_BEACON_FREE_FOOD_SLOT_COUNT) return undefined;
  const target = pickLowestValueBeacon(beacons, ownedTiles, playerId, tilesByKey);
  return target ? { x: target.x, y: target.y, kind: "disable" } : undefined;
};

/**
 * Tier 1a fallback: when the player owns RELAY_BEACON_FREE_FOOD_SLOT_COUNT
 * or fewer active beacons, chooseLowValueBeaconToDisable above refuses to
 * touch them (disabling would free nothing). Abandoning the least-valuable
 * one's tile instead doesn't relieve the FOOD shortage either — the beacon
 * was never charging a slot — but it does something disabling can't: it
 * actually releases the territory instead of leaving a "manual"-disabled
 * husk that nothing in the planner ever re-enables (chooseManuallyDisabled
 * BeaconToReenable below only fires once FOOD has headroom again, which a
 * shortage-driven disable at this beacon count would never reach). A
 * released tile can be reclaimed later via ordinary EXPAND/SETTLE, same
 * trade-off as chooseTownToAbandon's Tier 3.
 */
export const chooseLowValueBeaconToAbandon = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile> | undefined
): FoodSlotReliefPlan | undefined => {
  if (!tilesByKey) return undefined;
  const beacons = activeNonManualBeacons(ownedTiles, playerId);
  if (beacons.length === 0 || beacons.length > RELAY_BEACON_FREE_FOOD_SLOT_COUNT) return undefined;
  const target = pickLowestValueBeacon(beacons, ownedTiles, playerId, tilesByKey);
  return target ? { x: target.x, y: target.y, kind: "abandon_beacon" } : undefined;
};

/**
 * The inverse of the disable tiers above: a RELAY_BEACON this player
 * previously disabled for FOOD relief (status "inactive", inactiveReason
 * "manual" — see handleSetConverterStructureEnabledCommand) that's safe to
 * flip back on now that FOOD has headroom again. Nothing else in the
 * planner ever does this on its own, so without it a beacon disabled while
 * FOOD was tight stays dead forever even after the shortage passes — see
 * the file header's Sigrid incident. Deterministic (lowest x, then y) when
 * more than one qualifies.
 */
export const chooseManuallyDisabledBeaconToReenable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string
): FoodSlotReenableTarget | undefined => {
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== playerId) continue;
    if (structure.type !== "RELAY_BEACON") continue;
    if (structure.status !== "inactive" || structure.inactiveReason !== "manual") continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * Number of this player's active reach anchors (TOWN, DOCK, active
 * RELAY_BEACON, active SIEGE_OUTPOST) covering each tile key. Used to tell
 * whether a given beacon is the *sole* anchor reaching a tile (count === 1,
 * and since the tile is inside the beacon's own disk that sole anchor must
 * be it) versus redundantly covered (count > 1, safe to give up).
 */
const anchorCoverCount = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string
): Map<string, number> => {
  const counts = new Map<string, number>();
  const addReach = (anchor: ReachAnchor): void => {
    for (const key of tileKeysInReach(anchor)) counts.set(key, (counts.get(key) ?? 0) + 1);
  };
  for (const tile of ownedTiles) {
    if (tile.ownerId !== playerId) continue;
    if (tile.town) addReach({ x: tile.x, y: tile.y, ownerId: "", activatedAt: 0, kind: "TOWN" });
    if (tile.dockId) addReach({ x: tile.x, y: tile.y, ownerId: "", activatedAt: 0, kind: "DOCK" });
    const beacon = tile.economicStructure;
    if (beacon && beacon.ownerId === playerId && beacon.type === "RELAY_BEACON" && beacon.status === "active") {
      addReach({ x: tile.x, y: tile.y, ownerId: "", activatedAt: 0, kind: "OUTPOST" });
    }
    if (tile.siegeOutpost?.ownerId === playerId && tile.siegeOutpost.status === "active") {
      addReach({ x: tile.x, y: tile.y, ownerId: "", activatedAt: 0, kind: "OUTPOST" });
    }
  }
  return counts;
};

// Every economicStructure type that occupies a FOOD slot per
// STRUCTURE_SLOT_REQUIREMENTS. RELAY_BEACON is deliberately excluded here —
// it's handled by chooseLowValueBeaconToDisable above, which scores it on
// reach value rather than treating it as an interchangeable FOOD sink.
const isFoodConsumingStructureType = (type: SlotStructureType): boolean =>
  type !== "RELAY_BEACON" && structureSlotRequirements(type).some((req) => req.resource === "FOOD");

/**
 * Fallback target once no beacon exists to disable at all: any other active
 * FOOD-consuming structure this player owns.
 *
 * Prefers a structure the dormancy system (resource-slot-view.ts) already
 * flagged FOOD-dormant — already contributing zero effect, so disabling it
 * costs nothing in current output — but that requirement used to be a hard
 * gate: if nothing happened to be dormant yet (e.g. a player sitting exactly
 * at supply === demand, where nothing is short enough to go dormant), the
 * fallback found nothing and the AI stayed stuck anyway. It now falls
 * through to any active FOOD-consuming structure when no dormant one exists
 * — losing that structure's own output is a real cost, but a temporary,
 * reversible one (SET_CONVERTER_STRUCTURE_ENABLED can always flip it back
 * on), and unblocking the AI is worth more than protecting one structure's
 * output indefinitely.
 *
 * Deterministic (lowest x, then y) in both tiers.
 */
export const chooseFoodConsumingStructureToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined
): FoodSlotReliefPlan | undefined => {
  let bestDormant: TTile | undefined;
  let bestAny: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== playerId) continue;
    // A manually-disabled structure has status "inactive" (see
    // handleSetConverterStructureEnabledCommand) and is already excluded from
    // demand contribution, so it can never appear in the dormancy set below —
    // this "active" check exists to skip under_construction/removing only.
    if (structure.status !== "active") continue;
    if (!structure.type || !isFoodConsumingStructureType(structure.type)) continue;
    if (!bestAny || tile.x < bestAny.x || (tile.x === bestAny.x && tile.y < bestAny.y)) bestAny = tile;
    if (!foodDormantEconomicStructureKeys?.has(`${tile.x},${tile.y}`)) continue;
    if (!bestDormant || tile.x < bestDormant.x || (tile.x === bestDormant.x && tile.y < bestDormant.y)) bestDormant = tile;
  }
  const best = bestDormant ?? bestAny;
  return best ? { x: best.x, y: best.y, kind: "disable" } : undefined;
};

// Population tiers ordered least-to-most developed, matching the town-growth
// ladder (TOWN_POPULATION_TIER_ORDER-equivalent) — used to pick the least
// costly town to abandon. SETTLEMENT is excluded entirely: it's a player's
// capital-equivalent starting town, and handleUncaptureTileCommand rejects
// abandoning it outright ("cannot abandon your settlement").
const ABANDONABLE_TOWN_TIER_RANK: Record<Exclude<NonNullable<AutomationPlannerTile["town"]>["populationTier"], "SETTLEMENT" | undefined>, number> = {
  TOWN: 0,
  CITY: 1,
  GREAT_CITY: 2,
  METROPOLIS: 3
};

/**
 * Tier 3 fallback: the least-developed town this player can legally abandon
 * via UNCAPTURE_TILE once no structure exists to disable at all — the
 * shortage is coming from town population itself, not a structure. Skips the
 * SETTLEMENT-tier town (see ABANDONABLE_TOWN_TIER_RANK) and requires this
 * player own more than one settled town — handleUncaptureTileCommand rejects
 * both cases anyway ("cannot abandon your settlement" / "cannot abandon your
 * last town"), so this mirrors that eligibility rather than relying on the
 * rejection to filter it out, since a rejected command just burns a planner
 * tick for nothing.
 *
 * Picks the lowest population tier (least output/population sacrificed),
 * then lowest x, then y among ties.
 */
export const chooseTownToAbandon = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string
): FoodSlotReliefPlan | undefined => {
  const settledTowns = ownedTiles.filter(
    (tile) => tile.town && tile.ownerId === playerId && tile.ownershipState === "SETTLED"
  );
  if (settledTowns.length <= 1) return undefined;
  let best: { tile: TTile; rank: number } | undefined;
  for (const tile of settledTowns) {
    const tier = tile.town?.populationTier;
    if (!tier || tier === "SETTLEMENT") continue;
    const rank = ABANDONABLE_TOWN_TIER_RANK[tier];
    if (
      !best ||
      rank < best.rank ||
      (rank === best.rank && (tile.x < best.tile.x || (tile.x === best.tile.x && tile.y < best.tile.y)))
    ) {
      best = { tile, rank };
    }
  }
  return best ? { x: best.tile.x, y: best.tile.y, kind: "abandon_town" } : undefined;
};

/**
 * Convenience wrapper for planAutomationCommand: bundles the relief target
 * (low-value beacon disable, then low-value beacon abandon once disabling
 * can't help, then any FOOD-consuming structure, then — only once none of
 * those exist — the least-developed abandonable town) with whether FOOD
 * slots are exhausted — supply has zero (or negative) headroom over demand,
 * i.e. `foodSlotSupply <= foodSlotDemand` — and, on the opposite side, a
 * manually-disabled beacon worth re-enabling now that FOOD has headroom.
 *
 * This is deliberately NOT needVector.FOOD_SLOTS (`clamp01(1 - supply /
 * demand)`): that deficit only reaches its max of 1 when supply is 0, so a
 * player sitting at supply === demand (in-budget, but with zero free slots
 * for anything new) reads as "no deficit" even though the very next build
 * that needs a FOOD slot — e.g. a RELAY_BEACON — is rejected with
 * INSUFFICIENT_SLOT. That mismatch left the AI stuck: build rejected, but
 * FREE_FOOD_SLOT never triggers to make room. Comparing supply/demand
 * directly here catches the "exactly full" case the clamped ratio misses.
 *
 * All the relief/abandon selectors do an O(ownedTiles) scan, so — per
 * AGENTS.md's AI CPU guardrails (no unconditional full-owned-tiles passes
 * regardless of empire size) — they only run once `exhausted` is actually
 * true. The reenable scan (the only thing useful in the opposite state)
 * is gated behind `ownedRelayBeaconCount` — the incrementally-maintained
 * count already threaded through as input.ownedStructureCounts.RELAY_BEACON
 * (see automation-command-planner-owned-tile-scaling.test.ts's CPU-budget
 * regression coverage) — so a player who owns no beacon at all, the common
 * case for most of an empire's lifetime, never pays for the scan. A player
 * who does own one or more beacons still scans on every non-exhausted tick;
 * that's an accepted, bounded cost until this needs its own incrementally-
 * maintained "manually disabled" gauge (mirrors ownedStructureCountByPlayer
 * ByType) rather than a real fix for the common empty case.
 */
export const foodSlotReliefFromPlannerInput = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined,
  tilesByKey: ReadonlyMap<string, TTile> | undefined,
  foodSlotSupply: number | undefined,
  foodSlotDemand: number | undefined,
  forceRelief = false,
  ownedRelayBeaconCount: number | undefined = undefined
): { reliefTarget: FoodSlotReliefPlan | undefined; exhausted: boolean; reenableTarget: FoodSlotReenableTarget | undefined } => {
  const demand = foodSlotDemand ?? 0;
  const supply = foodSlotSupply ?? 0;
  const exhausted = forceRelief || (demand > 0 && supply <= demand);
  if (!exhausted) {
    const reenableTarget =
      (ownedRelayBeaconCount ?? 0) > 0 ? chooseManuallyDisabledBeaconToReenable(ownedTiles, playerId) : undefined;
    return { reliefTarget: undefined, exhausted, reenableTarget };
  }
  const reliefTarget =
    chooseLowValueBeaconToDisable(ownedTiles, playerId, tilesByKey) ??
    chooseLowValueBeaconToAbandon(ownedTiles, playerId, tilesByKey) ??
    chooseFoodConsumingStructureToDisable(ownedTiles, playerId, foodDormantEconomicStructureKeys) ??
    chooseTownToAbandon(ownedTiles, playerId);
  return { reliefTarget, exhausted, reenableTarget: undefined };
};
