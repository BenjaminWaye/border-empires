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

import { forEachFrontierNeighbor } from "../frontier-topology.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

export type FoodSlotReliefPlan = { x: number; y: number };

/**
 * Picks the active RELAY_BEACON this player owns whose OUTPOST_REACH_RADIUS
 * box holds no unclaimed resource, no unsettled town/dock, and isn't
 * bordering enemy territory — a beacon quietly projecting reach over empty,
 * uncontested, self-sufficient land is exactly the kind of low-value
 * structure that should give up its FOOD slot before a genuinely productive
 * or defensively-important one does. A SETTLED town/dock tile doesn't count
 * as reason to keep the beacon: it's already its own reach anchor (see
 * gatherReachAnchors), so the beacon isn't adding unique value there. A
 * beacon whose reach box touches the front (any tile inside it borders an
 * enemy-owned tile) is treated as valuable even with zero resources, since
 * losing that reach mid-war matters more than the slot it costs. Skips
 * beacons already manually disabled (inactiveReason "manual") or not yet
 * active (under_construction/removing).
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
    if (beaconHasValuableReach(tile.x, tile.y, playerId, tilesByKey)) continue;
    if (!best || tile.x < best.x || (tile.x === best.x && tile.y < best.y)) best = tile;
  }
  return best ? { x: best.x, y: best.y } : undefined;
};

const beaconHasValuableReach = <TTile extends AutomationPlannerTile>(
  x: number,
  y: number,
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile>
): boolean => {
  const anchor: ReachAnchor = { x, y, ownerId: "", activatedAt: 0, kind: "OUTPOST" };
  for (const key of tileKeysInReach(anchor)) {
    const tile = tilesByKey.get(key);
    if (!tile) continue;
    if (tile.resource) return true;
    // A SETTLED town/dock tile is itself a reach anchor (see
    // gatherReachAnchors in runtime-reach-anchors.ts, kind "TOWN"/"DOCK") --
    // it projects its own surrounding reach regardless of this beacon, so
    // the beacon isn't adding unique value by merely covering it. Only an
    // unsettled town/dock tile (not yet its own anchor) still depends on
    // this beacon's reach to stay held.
    if ((tile.dockId || tile.town) && tile.ownershipState !== "SETTLED") return true;
    if (tileBordersEnemy(tile, playerId, tilesByKey)) return true;
  }
  return false;
};

const tileBordersEnemy = <TTile extends AutomationPlannerTile>(
  tile: TTile,
  playerId: string,
  tilesByKey: ReadonlyMap<string, TTile>
): boolean => {
  let bordersEnemy = false;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (bordersEnemy) return;
    const neighborOwnerId = tilesByKey.get(`${nx},${ny}`)?.ownerId;
    if (neighborOwnerId && neighborOwnerId !== playerId) bordersEnemy = true;
  });
  return bordersEnemy;
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

// A RELAY_BEACON (the structure this relief path exists to unblock) costs 1
// FOOD slot -- see STRUCTURE_SLOT_REQUIREMENTS in
// packages/shared/src/structure-slots/structure-slots.ts. "Exhausted" means
// there isn't a full free slot left for one more build at that cost, which
// is the same hard check the command validator uses for INSUFFICIENT_SLOT.
const FOOD_SLOT_COST_FOR_RELIEF = 1;

/**
 * Convenience wrapper for planAutomationCommand: bundles the disable target
 * (low-value beacon first, dormant structure as fallback) with whether FOOD
 * slots are exhausted for one more build.
 *
 * This reads raw FOOD slot supply/demand rather than needVector.FOOD_SLOTS
 * (a smoothed 0-1 deficit ratio that only reaches 1 once supply hits zero
 * entirely). A player can be hard-rejected with INSUFFICIENT_SLOT well
 * before that -- e.g. supply covering 92% of demand still leaves zero free
 * slots for one more build -- so gating relief on the smoothed ratio left
 * the AI stuck retrying the same rejected build indefinitely instead of
 * freeing a slot. See food-slot-relief.test.ts for the staging scenario
 * (needVector.FOOD_SLOTS as low as 0.056) this was missing.
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
  const exhausted = demand > 0 && supply - demand < FOOD_SLOT_COST_FOR_RELIEF;
  if (!exhausted) return { disableTarget: undefined, exhausted };
  const disableTarget =
    chooseLowValueBeaconToDisable(ownedTiles, playerId, tilesByKey) ??
    chooseDormantFoodStructureToDisable(ownedTiles, playerId, foodDormantEconomicStructureKeys);
  return { disableTarget, exhausted };
};
