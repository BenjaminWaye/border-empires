// Food-slot relief: when a player is fully out of FOOD slots (demand ≥
// supply, nothing left over) and has no way to grow FOOD supply directly
// (no FARMSTEAD/WATERWORKS/GRANARY build available — chooseBestEconomicBuild
// found nothing), the AI was previously just stuck: every FOOD-consuming
// build stays illegal forever, RELAY_BEACON included (it costs its own FOOD
// slot once the built-in waiver is used up), so an AI that reaches this
// state can never expand its way out even though expansion — claiming a new
// FARM/FISH tile — is exactly what would fix the underlying shortage.
//
// The dormancy system (resource-slot-view.ts) already picks a victim when
// supply falls short: the newest FOOD-consuming structure goes dormant
// (stops producing) rather than being removed. A dormant structure is
// already contributing nothing, so demolishing one of them (REMOVE_STRUCTURE,
// which already exists as a player-facing command — see
// client-action-flow.ts) costs nothing in current output and permanently
// frees its slot, which is the free-up-a-slot in the same breath. This
// module just picks which dormant structure to remove.
import type { NeedVector } from "./build/build-need-vector.js";
import type { AutomationPlannerTile } from "./automation-command-planner-types.js";

export type FoodSlotReliefPlan = { x: number; y: number };

/**
 * Picks a FOOD-dormant economicStructure this player owns to REMOVE_STRUCTURE.
 * `foodDormantEconomicStructureKeys` is the "x,y" tile-key set from
 * Runtime.foodDormantEconomicStructureKeysForPlayer — structures already
 * short specifically on FOOD (not e.g. dormant on CRYSTAL alone), since only
 * removing one of those actually frees a FOOD slot.
 *
 * Deterministic (lowest x, then y) rather than value-scored: every candidate
 * here is, by construction, already producing zero effect, so there is no
 * real "better" pick among them — determinism just keeps behavior
 * reproducible in tests/diagnostics instead of picking arbitrarily per call.
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

/** Convenience wrapper for planAutomationCommand: bundles the removal candidate with whether FOOD slots are fully exhausted (needVector's FOOD_SLOTS deficit at max — supply <= 0 relative to demand). */
export const foodSlotReliefFromPlannerInput = <TTile extends AutomationPlannerTile>(
  ownedTiles: readonly TTile[],
  playerId: string,
  foodDormantEconomicStructureKeys: ReadonlySet<string> | undefined,
  needVector: NeedVector | undefined
): { removal: FoodSlotReliefPlan | undefined; exhausted: boolean } => ({
  removal: chooseFoodSlotReliefRemoval(ownedTiles, playerId, foodDormantEconomicStructureKeys),
  exhausted: (needVector?.FOOD_SLOTS ?? 0) >= 1
});
