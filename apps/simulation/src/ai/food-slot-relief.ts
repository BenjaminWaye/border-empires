// Food-slot relief: when a player is fully out of FOOD slots (demand ≥
// supply, nothing left over) and has no way to grow FOOD supply directly
// (no FARMSTEAD/WATERWORKS/GRANARY build available — chooseBestEconomicBuild
// found nothing), the AI was previously just stuck: every FOOD-consuming
// build stays illegal forever, RELAY_BEACON included (it costs its own FOOD
// slot once the built-in waiver is used up), so an AI that reaches this
// state can never expand its way out even though expansion — claiming a new
// FARM/FISH tile — is exactly what would fix the underlying shortage.
//
// The fix is always DISABLE, never REMOVE_STRUCTURE/demolish: disabling
// (SET_CONVERTER_STRUCTURE_ENABLED, enabled: false) frees the FOOD slot just
// as completely as demolition does — a manually-disabled structure is
// excluded from demand contribution entirely, see buildDemandContributors's
// `inactiveReason !== "manual"` check — but is reversible (the AI, or a
// human, can flip it back on once FOOD has headroom again) and keeps the
// build itself intact. Demolition has no advantage over disabling here, so
// this module never picks a REMOVE_STRUCTURE target.
//
// Preferred target: the active RELAY_BEACON this player owns that would cost
// the *least* FOOD-producing reach to give up — see chooseLowValueBeaconToDisable.
//
// Fallback target: if no beacon exists at all, any other active
// FOOD-consuming structure — preferring one the dormancy system
// (resource-slot-view.ts) already flagged FOOD-dormant (already contributing
// zero effect, so disabling it costs nothing in current output), but falling
// back further to any active FOOD-consuming structure if none is dormant —
// see chooseFoodConsumingStructureToDisable.
import { tileKeysInReach, structureSlotRequirements, type ReachAnchor, type SlotStructureType } from "@border-empires/shared";

import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

export type FoodSlotReliefPlan = { x: number; y: number };

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
export const chooseLowValueBeaconToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile> | undefined
): FoodSlotReliefPlan | undefined => {
  if (!tilesByKey) return undefined;
  const beacons = ownedTiles.filter((tile) => {
    const structure = tile.economicStructure;
    return structure && structure.ownerId === playerId && structure.type === "RELAY_BEACON" && structure.status === "active" && structure.inactiveReason !== "manual";
  });
  if (beacons.length === 0) return undefined;
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
  return best ? { x: best.tile.x, y: best.tile.y } : undefined;
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
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * Convenience wrapper for planAutomationCommand: bundles the disable target
 * (low-value beacon first, any FOOD-consuming structure as fallback) with
 * whether FOOD slots are exhausted — supply has zero (or negative) headroom
 * over demand, i.e. `foodSlotSupply <= foodSlotDemand`.
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
 * Both selectors above do an O(ownedTiles) scan, so — per AGENTS.md's AI CPU
 * guardrails (no unconditional full-owned-tiles passes regardless of empire
 * size) — they only run once `exhausted` is actually true. That's a rare
 * state for a healthy empire, and it's also the ONLY state either candidate
 * is useful in, so this costs nothing on the common path.
 */
export const foodSlotReliefFromPlannerInput = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined,
  tilesByKey: ReadonlyMap<string, TTile> | undefined,
  foodSlotSupply: number | undefined,
  foodSlotDemand: number | undefined
): { disableTarget: FoodSlotReliefPlan | undefined; exhausted: boolean } => {
  const demand = foodSlotDemand ?? 0;
  const supply = foodSlotSupply ?? 0;
  const exhausted = demand > 0 && supply <= demand;
  if (!exhausted) return { disableTarget: undefined, exhausted };
  const disableTarget =
    chooseLowValueBeaconToDisable(ownedTiles, playerId, tilesByKey) ??
    chooseFoodConsumingStructureToDisable(ownedTiles, playerId, foodDormantEconomicStructureKeys);
  return { disableTarget, exhausted };
};
