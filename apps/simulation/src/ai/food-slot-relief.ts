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
// Preferred target: an active RELAY_BEACON whose reach box holds zero
// valuable tiles — a beacon quietly projecting reach over empty land is
// contributing little to nothing toward the shortage. See
// chooseLowValueBeaconToDisable.
//
// Fallback target: if no such beacon exists, fall back to the dormancy
// system (resource-slot-view.ts), which already picks a victim when supply
// falls short: the newest FOOD-consuming structure goes dormant (stops
// producing) rather than being removed. A dormant structure is already
// contributing zero effect, so disabling one of them costs nothing in
// current output and permanently frees its slot until re-enabled.
import { tileKeysInReach, type ReachAnchor } from "@border-empires/shared";

import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

export type FoodSlotReliefPlan = { x: number; y: number };

/**
 * Picks the active RELAY_BEACON this player owns whose OUTPOST_REACH_RADIUS
 * box holds no valuable tile (town/resource/dock) at all — a beacon
 * "expanding reach over an area with zero resources", exactly the kind of
 * low-value structure that should give up its FOOD slot before a genuinely
 * productive building does. Skips beacons already manually disabled
 * (inactiveReason "manual") or not yet active (under_construction/removing).
 *
 * Deterministic (lowest x, then y) among zero-value candidates — there's no
 * meaningful "worse than zero", so tie-breaking just keeps behavior
 * reproducible instead of picking arbitrarily per call.
 */
export const chooseLowValueBeaconToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile> | undefined
): FoodSlotReliefPlan | undefined => {
  if (!tilesByKey) return undefined;
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== playerId || structure.type !== "RELAY_BEACON") continue;
    if (structure.status !== "active" || structure.inactiveReason === "manual") continue;
    if (beaconHasValuableReach(tile.x, tile.y, tilesByKey)) continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

const beaconHasValuableReach = <TTile extends AutomationPlannerTile>(
  x: number,
  y: number,
  tilesByKey: ReadonlyMap<string, TTile>
): boolean => {
  const anchor: ReachAnchor = { x, y, ownerId: "", activatedAt: 0, kind: "OUTPOST" };
  for (const key of tileKeysInReach(anchor)) {
    const tile = tilesByKey.get(key);
    if (tile && (tile.resource || tile.dockId || tile.town)) return true;
  }
  return false;
};

/**
 * Fallback target: a FOOD-dormant economicStructure this player owns, to
 * disable (not remove) once no low-value beacon exists.
 * `foodDormantEconomicStructureKeys` is the "x,y" tile-key set from
 * Runtime.foodDormantEconomicStructureKeysForPlayer — structures already
 * short specifically on FOOD (not e.g. dormant on CRYSTAL alone), since only
 * disabling one of those actually frees a FOOD slot.
 *
 * Deterministic (lowest x, then y) rather than value-scored: every candidate
 * here is, by construction, already producing zero effect, so there is no
 * real "better" pick among them.
 */
export const chooseDormantFoodStructureToDisable = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined
): FoodSlotReliefPlan | undefined => {
  if (!foodDormantEconomicStructureKeys || foodDormantEconomicStructureKeys.size === 0) return undefined;
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== playerId) continue;
    // A manually-disabled structure has status "inactive" (see
    // handleSetConverterStructureEnabledCommand) and is already excluded from
    // demand contribution, so it can never appear in the dormancy set below —
    // this "active" check exists to skip under_construction/removing only.
    if (structure.status !== "active") continue;
    if (!foodDormantEconomicStructureKeys.has(`${tile.x},${tile.y}`)) continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * Convenience wrapper for planAutomationCommand: bundles the disable target
 * (low-value beacon first, dormant structure as fallback) with whether FOOD
 * slots are exhausted — supply has zero (or negative) headroom over demand,
 * i.e. `foodSlotSupply <= foodSlotDemand`.
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
    chooseDormantFoodStructureToDisable(ownedTiles, playerId, foodDormantEconomicStructureKeys);
  return { disableTarget, exhausted };
};
