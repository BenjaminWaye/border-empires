import type { DomainPlayer } from "@border-empires/game-domain";
import {
  FORT_TIER_LADDER,
  SIEGE_TIER_LADDER,
  STRUCTURE_REGISTRY,
  structureBuildGoldCost,
  structureBuildManpowerCostScaled,
  structureCostDefinition,
  type BuildableStructureType,
  type FortVariant,
  type SiegeBatteryVariant
} from "@border-empires/shared";
import type { RuntimeStructureCommandContext } from "./runtime-structure-command-handlers.js";
import { stripRetiredStockpileCost } from "./runtime-structure-command-handlers.js";
import { multiplicativeEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";
import type { StrategicResourceKey } from "./runtime-types.js";
import { creditManpower } from "./runtime-manpower-ceiling.js";
import { structureManpowerCostForPlayer } from "./structure-manpower-cost/structure-manpower-cost.js";

type StrategicRefund = Partial<Record<StrategicResourceKey, number>>;

export type StructureCancelRefund = {
  gold: number;
  manpower: number;
  strategic: StrategicRefund;
};

// Cancelling a build/upgrade must hand back exactly what handleBuildStructureCommand
// (runtime-structure-command-handlers.ts) took, or the player permanently loses that
// gold/manpower/strategic spend. Fort and siege battery tiers are recomputed from the
// tile's stored `variant` (not the player's *current* tech) so a tech unlock mid-build
// can't change what gets refunded -- this is exact regardless of concurrency, since the
// ladder is keyed by variant, not by a count that could shift under other in-flight builds.
//
// Economic/observatory gold is scaling-by-owned-count, so we subtract 1 from the current
// owned-structure-count index first: the index bumps as soon as construction starts, so by
// cancel time it already counts this under-construction structure, and `count - 1`
// reproduces the count that was active when *this* build started. Known limitation: this
// is exact as long as the player has at most one structure of that type under construction
// at a time. If two builds of the same scaling economic/observatory type are in flight
// concurrently (allowed by DEVELOPMENT_PROCESS_LIMIT slots) and only one is cancelled, the
// refund can be attributed to the wrong tier -- the discrepancy nets to zero once every
// concurrent build of that type is either completed or cancelled, but cancelling one while
// keeping the other can over- or under-refund by the gap between two adjacent cost tiers.
// A fully drift-proof fix would persist the exact cost paid on the tile at build time.
function creditStrategicResource(actor: DomainPlayer, resource: StrategicResourceKey, amount: number): void {
  if (amount <= 0) return;
  const current = actor.strategicResources?.[resource] ?? 0;
  actor.strategicResources = { ...(actor.strategicResources ?? {}), [resource]: current + amount };
}

export function applyStructureCancelRefund(context: RuntimeStructureCommandContext, actor: DomainPlayer, refund: StructureCancelRefund): void {
  actor.points += refund.gold;
  creditManpower(actor, refund.manpower, context.playerManpowerCap(actor));
  for (const resource of Object.keys(refund.strategic) as StrategicResourceKey[]) {
    creditStrategicResource(actor, resource, refund.strategic[resource] ?? 0);
  }
}

export function fortCancelRefund(actor: DomainPlayer, variant: FortVariant | undefined): StructureCancelRefund {
  const tier = FORT_TIER_LADDER[variant ?? "FORT"];
  const goldMult = multiplicativeEffectForPlayer(actor, "fortBuildGoldCostMult");
  // Step 5 item 3 (Slice A): TITANIUM is a retired build-time stockpile key (never
  // actually spent by handleBuildStructureCommand any more, see
  // stripRetiredStockpileCost) -- refunding it here would hand back a resource
  // that was never taken.
  return {
    gold: Math.max(0, Math.round(tier.gold * goldMult)),
    manpower: structureManpowerCostForPlayer(actor, tier.variant, tier.manpower),
    strategic: stripRetiredStockpileCost({ TITANIUM: tier.titanium })
  };
}

export function siegeBatteryCancelRefund(actor: DomainPlayer, variant: SiegeBatteryVariant | undefined): StructureCancelRefund {
  const tier = SIEGE_TIER_LADDER[variant ?? "SIEGE_BATTERY"];
  return {
    gold: tier.gold,
    manpower: structureManpowerCostForPlayer(actor, tier.variant, tier.manpower),
    strategic: stripRetiredStockpileCost({ UMBRITE: tier.umbrite, ...(tier.titanium > 0 ? { TITANIUM: tier.titanium } : {}) })
  };
}

export function economicOrObservatoryCancelRefund(
  context: RuntimeStructureCommandContext,
  playerId: string,
  structureType: BuildableStructureType
): StructureCancelRefund {
  const existingCount = Math.max(0, context.ownedStructureCountForPlayer(playerId, structureType) - 1);
  const gold = structureBuildGoldCost(structureType, existingCount);
  // structureBuildManpowerCostScaled mirrors handleBuildStructureCommand's
  // charge (structureBuildManpowerCostScaled with the same pre-build
  // existingCount) so a cancelled Iron/Fur Weapons Factory refunds exactly
  // what was charged, not the flat base cost.
  const baseManpower = structureBuildManpowerCostScaled(structureType, existingCount);
  const actor = context.players.get(playerId);
  const manpower = actor ? structureManpowerCostForPlayer(actor, structureType, baseManpower) : baseManpower;
  // Mirrors handleBuildStructureCommand's strategicCostForStructure precedence exactly
  // (registry cost.strategic wins, falling back to the cost-definitions resourceCost) so
  // this can't drift from what was actually charged if the two tables ever disagree.
  // stripRetiredStockpileCost then drops FOOD/TITANIUM/CRYSTAL/UMBRITE (retired,
  // never actually spent) while preserving SHARD (monument assembly, still spent).
  const registryStrategic = STRUCTURE_REGISTRY[structureType]?.cost.strategic as StrategicRefund | undefined;
  const costDef = structureCostDefinition(structureType);
  const strategic: StrategicRefund =
    registryStrategic ?? (costDef.resourceCost ? { [costDef.resourceCost.resource]: costDef.resourceCost.amount } : {});
  return { gold, manpower, strategic: stripRetiredStockpileCost(strategic) };
}
