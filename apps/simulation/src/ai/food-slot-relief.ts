// Food-slot relief: when a player is fully out of FOOD slots (demand ≥
// supply, nothing left over) and has no way to grow FOOD supply directly
// (no FARMSTEAD/WATERWORKS/GRANARY build available — chooseBestEconomicBuild
// found nothing), the AI was previously just stuck: every FOOD-consuming
// build stays illegal forever, RELAY_BEACON included (it costs its own FOOD
// slot once the built-in waiver is used up), so an AI that reaches this
// state can never expand its way out even though expansion — claiming a new
// FARM/FISH tile — is exactly what would fix the underlying shortage.
//
// Preferred fix: DISABLE (not demolish) an active RELAY_BEACON whose reach
// box holds zero valuable tiles — a beacon quietly projecting reach over
// empty land is contributing little to nothing toward the shortage, and
// SET_CONVERTER_STRUCTURE_ENABLED is reversible (the AI, or a human, can
// flip it back on once a real FARM/FISH tile is claimed and FOOD has
// headroom again), unlike REMOVE_STRUCTURE. See chooseLowValueBeaconToDisable.
//
// Fallback: if no such beacon exists, fall back to the dormancy system
// (resource-slot-view.ts), which already picks a victim when supply falls
// short: the newest FOOD-consuming structure goes dormant (stops producing)
// rather than being removed. A dormant structure is already contributing
// zero effect, so demolishing one of them (REMOVE_STRUCTURE) costs nothing
// in current output and permanently frees its slot — a genuine last resort
// once there's no reversible low-value beacon left to disable instead.
import { tileKeysInReach, type ReachAnchor } from "@border-empires/shared";

import type { NeedVector } from "./build/build-need-vector.js";
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
 * Picks a FOOD-dormant economicStructure this player owns to REMOVE_STRUCTURE.
 * `foodDormantEconomicStructureKeys` is the "x,y" tile-key set from
 * Runtime.foodDormantEconomicStructureKeysForPlayer — structures already
 * short specifically on FOOD (not e.g. dormant on CRYSTAL alone), since only
 * removing one of those actually frees a FOOD slot. Last resort — see
 * chooseLowValueBeaconToDisable above for the preferred, reversible fix.
 */
export const chooseFoodSlotReliefRemoval = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined
): FoodSlotReliefPlan | undefined => {
  if (!foodDormantEconomicStructureKeys || foodDormantEconomicStructureKeys.size === 0) return undefined;
  let best: TTile | undefined;
  for (const tile of ownedTiles) {
    const structure = tile.economicStructure;
    if (!structure || structure.ownerId !== playerId) continue;
    if (structure.status === "removing" || structure.status === "under_construction") continue;
    if (!foodDormantEconomicStructureKeys.has(`${tile.x},${tile.y}`)) continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

/**
 * Convenience wrapper for planAutomationCommand: bundles both relief
 * candidates with whether FOOD slots are fully exhausted (needVector's
 * FOOD_SLOTS deficit at max — supply <= 0 relative to demand).
 *
 * Both selectors below do an O(ownedTiles) scan, so — per AGENTS.md's AI CPU
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
  needVector: NeedVector | undefined
): { disableBeacon: FoodSlotReliefPlan | undefined; removal: FoodSlotReliefPlan | undefined; exhausted: boolean } => {
  const exhausted = (needVector?.FOOD_SLOTS ?? 0) >= 1;
  if (!exhausted) return { disableBeacon: undefined, removal: undefined, exhausted };
  return {
    disableBeacon: chooseLowValueBeaconToDisable(ownedTiles, playerId, tilesByKey),
    removal: chooseFoodSlotReliefRemoval(ownedTiles, playerId, foodDormantEconomicStructureKeys),
    exhausted
  };
};
