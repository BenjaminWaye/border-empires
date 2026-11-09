// Food-slot relief: when a player is fully out of FOOD slots (demand ≥
// supply, nothing left over) and has no way to grow FOOD supply directly
// (no HYDROGARDEN/HYDROWORKS build available — chooseBestEconomicBuild
// found nothing), the AI was previously just stuck: every FOOD-consuming
// build stays illegal forever, RELAY_BEACON included (it costs its own FOOD
// slot once the built-in waiver is used up), so an AI that reaches this
// state can never expand its way out even though expansion — claiming a new
// FARM/FISH tile — is exactly what would fix the underlying shortage.
//
// Every structure tier is DISABLE, never
// REMOVE_STRUCTURE/demolish: disabling (SET_CONVERTER_STRUCTURE_ENABLED,
// enabled: false) frees the FOOD slot just as completely as demolition does
// — a manually-disabled structure is excluded from demand contribution
// entirely, see buildDemandContributors's `inactiveReason !== "manual"`
// check — but is reversible (the AI, or a human, can flip it back on once
// FOOD has headroom again) and keeps the build itself intact. Demolition has
// no advantage over disabling here, so no structure tier ever
// picks a REMOVE_STRUCTURE target.
//
// Order (expansion first — reach is what grows the empire; see
// foodSlotReliefFromPlannerInput):
// Free tiers, allowed at exactly-full FOOD too, each giving up nothing that
// is producing:
//   1. a MINE/UMBRITE_RIG whose resource is in surplus
//      (food-slot-relief-surplus.ts);
//   2. a RELAY_BEACON whose whole reach other anchors already cover
//      (chooseLowValueBeaconToDisable with redundantOnly);
//   3. a FOOD-dormant consumer (chooseFoodConsumingStructureToDisable with
//      dormantOnly).
// Costly tiers, only in a real deficit or when a beacon site waits on a slot:
//   4. any working FOOD-consuming structure;
//   5. the beacon holding the least unique FOOD/valuable/plain land;
//   6. abandoning a town (below).
//
// Tier 6: if nothing above found anything, the shortage is coming
// entirely from town population itself (townFoodSlotDemandForTier in
// resource-slot-view.ts) — no structure exists to disable at all. The only
// remaining lever is UNCAPTURE_TILE ("Abandon Territory" in the client):
// releasing a town tile back to neutral removes 100% of that town's FOOD
// demand in one move, not just one slot's worth. Unlike tiers 1-5 this is
// NOT reversible the same way — the tile itself can only be reclaimed later
// via ordinary EXPAND/SETTLE, not flipped back on — so it only ever targets
// this player's least-developed eligible town (never the SETTLEMENT-tier
// capital, which handleUncaptureTileCommand refuses outright) and only when
// they own more than one. See chooseTownToAbandon.
//
// Beacons inside the free FOOD waiver must be preserved: abandoning them
// frees no FOOD and removes the reach needed to claim a new FOOD source.
import {
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  tileKeysInReach,
  structureSlotRequirements,
  type ReachAnchor,
  type SlotStructureType
} from "@border-empires/shared";

import type { AutomationPlannerTile } from "./automation-command-planner-types.js";
import {
  chooseManuallyDisabledToReenable,
  chooseSurplusProducerToDisable,
  type ResourceSlotHeadroom
} from "./food-slot-relief-surplus.js";

// FOOD slots a re-enabled RELAY_BEACON takes back (past the free waiver,
// which is the only case the disable tier ever touches).
const RELAY_BEACON_FOOD_SLOT_COST = structureSlotRequirements("RELAY_BEACON")
  .filter((req) => req.resource === "FOOD")
  .reduce((total, req) => total + req.count, 0);

export type FoodSlotReliefPlan ={ x: number; y: number; kind: "disable" | "abandon_town" };

/** A manually-disabled RELAY_BEACON this player owns, worth flipping back on. */
export type FoodSlotReenableTarget = { x: number; y: number };

/**
 * Picks the active RELAY_BEACON this player owns that costs the *least*
 * uniquely-held FOOD-producing reach to disable.
 *
 * A beacon's reach can overlap a TOWN's, a DOCK's, or another active
 * beacon's — losing this one specific anchor doesn't cost
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
 * then y for reproducibility. Only used when disabling a paid beacon would
 * actually free FOOD capacity.
 */
const pickLowestValueBeacon = <TTile extends AutomationPlannerTile>(
  beacons: readonly TTile[],
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile>
): { tile: TTile; foodLoss: number; otherLoss: number; landLoss: number } | undefined => {
  const coverCount = anchorCoverCount(ownedTiles, playerId);
  let best: { tile: TTile; foodLoss: number; otherLoss: number; landLoss: number } | undefined;
  for (const tile of beacons) {
    const anchor: ReachAnchor = { x: tile.x, y: tile.y, ownerId: "", activatedAt: 0, kind: "OUTPOST" };
    let foodLoss = 0;
    let otherLoss = 0;
    // Plain LAND only this beacon reaches. A tile missing from the view is
    // unknown, so it counts as a loss — the "free" tier must never guess.
    let landLoss = 0;
    for (const key of tileKeysInReach(anchor)) {
      if ((coverCount.get(key) ?? 0) > 1) continue; // covered by another of this player's anchors too — no loss
      const reachedTile = tilesByKey.get(key);
      if (!reachedTile) {
        landLoss += 1;
        continue;
      }
      if (reachedTile.resource === "FARM" || reachedTile.resource === "FISH") foodLoss += 1;
      else if (reachedTile.resource || reachedTile.dockId || reachedTile.town) otherLoss += 1;
      else if (reachedTile.terrain === "LAND") landLoss += 1;
    }
    const better =
      !best ||
      foodLoss < best.foodLoss ||
      (foodLoss === best.foodLoss && otherLoss < best.otherLoss) ||
      (foodLoss === best.foodLoss && otherLoss === best.otherLoss && landLoss < best.landLoss) ||
      (foodLoss === best.foodLoss && otherLoss === best.otherLoss && landLoss === best.landLoss &&
        (tile.x < best.tile.x || (tile.x === best.tile.x && tile.y < best.tile.y)));
    if (better) best = { tile, foodLoss, otherLoss, landLoss };
  }
  return best;
};

/**
 * The lowest-value paid beacon and whether switching it off is free (every
 * tile it reaches is also reached by another of the player's anchors). One
 * scan serves both the free and the costly relief tier.
 */
const lowValueBeaconCandidate = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile> | undefined
): { plan: FoodSlotReliefPlan; free: boolean } | undefined => {
  if (!tilesByKey) return undefined;
  const beacons = activeNonManualBeacons(ownedTiles, playerId);
  // Below the waiver count, every one of these beacons already costs 0 FOOD
  // slots (see file header) — disabling one here would sacrifice its reach
  // for no relief at all, so this tier refuses to pick a target and defers
  // to another actual FOOD consumer instead.
  if (beacons.length === 0 || beacons.length <= RELAY_BEACON_FREE_FOOD_SLOT_COUNT) return undefined;
  const best = pickLowestValueBeacon(beacons, ownedTiles, playerId, tilesByKey);
  if (!best) return undefined;
  return { plan: { x: best.tile.x, y: best.tile.y, kind: "disable" }, free: best.foodLoss + best.otherLoss + best.landLoss === 0 };
};

export const chooseLowValueBeaconToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile> | undefined,
  options: { redundantOnly?: boolean } = {}
): FoodSlotReliefPlan | undefined => {
  const candidate = lowValueBeaconCandidate(ownedTiles, playerId, tilesByKey);
  // redundantOnly: switching it off must give up nothing.
  return candidate && (!options.redundantOnly || candidate.free) ? candidate.plan : undefined;
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
 *
 * Only SETTLED tiles qualify: handleSetConverterStructureEnabledCommand
 * rejects enabling on any other tile ("structure requires a garrisoned owned
 * tile"). Picking a FRONTIER beacon here re-proposed the same doomed command
 * every rejection cooldown, forever — 15 of 20 prod AIs were stuck on it.
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
    if (tile.ownershipState !== "SETTLED") continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * A structure this player disabled for FOOD relief whose type no longer has
 * any slot requirement (the frontier resource-network installations lost
 * their FOOD slot), so it costs nothing to run. Without this, one switched
 * off before that change would stay dead forever. Same SETTLED-only rule and
 * deterministic order as the beacon chooser above.
 */
export const chooseManuallyDisabledFreeStructureToReenable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string
): FoodSlotReenableTarget | undefined => {
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure?.type || structure.ownerId !== playerId) continue;
    if (structure.status !== "inactive" || structure.inactiveReason !== "manual") continue;
    if (structureSlotRequirements(structure.type as SlotStructureType).length > 0) continue;
    if (tile.ownershipState !== "SETTLED") continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * Number of this player's active reach anchors (TOWN, DOCK, active
 * RELAY_BEACON, active SIEGE_BATTERY) covering each tile key. Used to tell
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
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined,
  options: { dormantOnly?: boolean } = {}
): FoodSlotReliefPlan | undefined => {
  const { dormant, any } = foodConsumerCandidates(ownedTiles, playerId, foodDormantEconomicStructureKeys);
  return options.dormantOnly ? dormant : dormant ?? any;
};

/** One scan for both relief tiers: the lowest x/y FOOD-dormant consumer, and the lowest x/y consumer of any kind. */
const foodConsumerCandidates = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined
): { dormant: FoodSlotReliefPlan | undefined; any: FoodSlotReliefPlan | undefined } => {
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
  const plan = (tile: TTile | undefined): FoodSlotReliefPlan | undefined => (tile ? { x: tile.x, y: tile.y, kind: "disable" } : undefined);
  return { dormant: plan(bestDormant), any: plan(bestAny) };
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
    if (!tier || tier === "SETTLEMENT" || tile.afc?.ownerId === playerId) continue;
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
 * (paid beacon disable, then any FOOD-consuming structure, then — only once none of
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
  ownedRelayBeaconCount: number | undefined = undefined,
  ownedNetworkInstallationCount: number | undefined = undefined,
  resourceSlotHeadroom: ResourceSlotHeadroom | undefined = undefined,
  /** Lazily: would a Relay Beacon site exist with one more FOOD slot? */
  beaconWaitingOnFood: (() => boolean) | undefined = undefined
): { reliefTarget: FoodSlotReliefPlan | undefined; exhausted: boolean; reenableTarget: FoodSlotReenableTarget | undefined } => {
  const demand = foodSlotDemand ?? 0;
  const supply = foodSlotSupply ?? 0;
  const exhausted = forceRelief || (demand > 0 && supply <= demand);
  if (!exhausted) {
    // A manually-disabled beacon is already left out of `demand`, so the
    // headroom seen here includes the very slot that beacon would take back.
    // Re-enabling at headroom == its own cost lands on supply === demand,
    // which is `exhausted`, so the next tick disables it again (live staging:
    // ai-10/ai-19 toggled the same beacon every ~5s for hours). Only re-enable
    // when FOOD stays above demand afterwards.
    // With RELAY_BEACON_FREE_FOOD_SLOT_COUNT or fewer beacons owned, every one
    // is waived (the waiver goes to the earliest-activated), so it costs none.
    const reenableCost = (ownedRelayBeaconCount ?? Infinity) > RELAY_BEACON_FREE_FOOD_SLOT_COUNT ? RELAY_BEACON_FOOD_SLOT_COST : 0;
    const beaconHasHeadroom = supply - demand > reenableCost;
    // Beacons first (reach is the priority), then any other FOOD consumer
    // relief switched off — one owned-tile pass for both, so a large empire
    // (which always owns beacons) pays no more than the beacon scan it already
    // did. Same hysteresis for consumers: each costs one FOOD slot.
    const reenable = { beacons: (ownedRelayBeaconCount ?? 0) > 0 && beaconHasHeadroom, consumers: supply - demand > 1 };
    const reenableTarget =
      // Count-gated like the beacon scan: walking every owned tile each tick is
      // only worth it when there is a frontier installation to find.
      ((ownedNetworkInstallationCount ?? 0) > 0 ? chooseManuallyDisabledFreeStructureToReenable(ownedTiles, playerId) : undefined) ??
      (reenable.beacons || reenable.consumers
        ? chooseManuallyDisabledToReenable(ownedTiles, playerId, reenable, resourceSlotHeadroom, Date.now())
        : undefined);
    return { reliefTarget: undefined, exhausted, reenableTarget };
  }
  // Expansion first. Free relief (gives up nothing that is producing) is
  // always allowed, including at exactly-full FOOD. Costly relief only runs in
  // a real deficit, when slot data is missing and a build hit
  // INSUFFICIENT_SLOT, or when a Relay Beacon site is waiting on exactly this
  // one FOOD slot. At exactly-full it used to switch off a land-holding
  // beacon, and the freed slot then went to whatever built next (staging
  // season-41: 185 AI beacons switched off while 253 Manufactories ran).
  // Working buildings go before land-holding beacons.
  // Each chooser scans owned tiles once; the costly tier reuses the results.
  const surplus = chooseSurplusProducerToDisable(ownedTiles, playerId, resourceSlotHeadroom);
  const beacon = surplus ? undefined : lowValueBeaconCandidate(ownedTiles, playerId, tilesByKey);
  const consumers = surplus || beacon?.free ? undefined : foodConsumerCandidates(ownedTiles, playerId, foodDormantEconomicStructureKeys);
  const freeRelief = surplus ?? (beacon?.free ? beacon.plan : undefined) ?? consumers?.dormant;
  const inDeficit = forceRelief || supply < demand;
  const reliefTarget =
    freeRelief ??
    (inDeficit || beaconWaitingOnFood?.() === true
      ? consumers?.any ?? beacon?.plan ?? chooseTownToAbandon(ownedTiles, playerId)
      : undefined);
  return { reliefTarget, exhausted, reenableTarget: undefined };
};
