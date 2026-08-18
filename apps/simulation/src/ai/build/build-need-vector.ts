// Phase 1 of docs/ai-structure-building-rewrite-plan.md (§4/§9/§10.1): a
// measured need vector, computed and reported for diagnostics only. Nothing
// in the planner acts on this yet — that starts in Phase 2 (§6 scoring).
// computeNeedVector itself is intentionally pure (no tile scans, no runtime
// dependencies) so it stays cheap enough to compute on every plan and is
// unit-testable in isolation from the worker/runtime plumbing that feeds it;
// needVectorFromPlannerInput below is a thin convenience wrapper coupling it
// to AutomationPlannerInput's shape (a type-only import, erased at compile
// time — no runtime dependency added).
import { GOLD_RESCALE_DIVISOR } from "@border-empires/game-domain";
import type { SlotResource } from "@border-empires/shared";
import type { AutomationPlannerInput, AutomationPlannerTile } from "../automation-command-planner-types.js";

export type NeedKey =
  | "MANPOWER_THROUGHPUT"
  | "MANPOWER_CEILING"
  | "FOOD_SLOTS"
  | "TITANIUM_SLOTS"
  | "UMBRITE_SLOTS"
  | "CRYSTAL_SLOTS"
  | "GOLD"
  | "DEFENSE"
  | "OFFENSE"
  | "VICTORY";

/** Every value is a deficit in [0, 1] — 0 means the need is fully met, 1 means acute. */
export type NeedVector = Record<NeedKey, number>;

export type NeedVectorInput = {
  manpower: number;
  manpowerCapacity: number;
  manpowerRegenPerMinute: number;
  settledTileCount: number;
  incomePerMinute: number;
  slotSupplyByResource: Partial<Record<SlotResource, number>>;
  slotDemandByResource: Partial<Record<SlotResource, number>>;
  frontierEnemyTargetCount: number;
  /** Approximated as attackStalemateTargetTileKeys.size by the caller — see
   *  automation-command-planner.ts. A true "targets this class could win but
   *  can't reach" count needs frontier-analysis plumbing out of Phase 1 scope. */
  stalematedTargetCount: number;
  ownedForts: number;
  ownedSiegeOutposts: number;
  /** From AutomationStrategicSnapshot.primaryVictoryPathProgress (§7.2). */
  victoryPathProgress: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const slotDeficit = (
  resource: SlotResource,
  supplyByResource: Partial<Record<SlotResource, number>>,
  demandByResource: Partial<Record<SlotResource, number>>
): number => {
  const demand = demandByResource[resource] ?? 0;
  if (demand <= 0) return 0; // nothing consuming this resource — no need
  const supply = supplyByResource[resource] ?? 0;
  return clamp01(1 - supply / demand);
};

// §13.4/§1.3: mirrors economyWeak's shape (a floor scaled by empire size) but
// reads regen (a rate) rather than banked stock, which stays pinned near zero
// by construction regardless of empire health — see the plan's §1.3/§4.2.
const MANPOWER_THROUGHPUT_TARGET_PER_TILE = 0.08;
const MANPOWER_THROUGHPUT_TARGET_FLOOR = 0.4;

// §3.5: a stateless proxy for "regen is being thrown away." The plan's real
// formula (§4.2) tracks consecutive at-cap ticks, which needs per-player
// memory that doesn't exist until Phase 3's savings pool lands — this ramps
// over the top 10% of the cap instead, which is directionally the same
// signal (manpower sitting near the ceiling) without new state.
const CEILING_PIN_BAND = 0.1;

// §7.2/§4.2: mirrors automation-strategic-snapshot.ts's economyTarget so the
// GOLD need reads on the same scale scoreVictoryPaths already uses.
const GOLD_TARGET_PER_TILE = 0.55;
const GOLD_TARGET_FLOOR = 8;

export const computeNeedVector = (inp: NeedVectorInput): NeedVector => {
  const manpowerThroughputTarget =
    MANPOWER_THROUGHPUT_TARGET_PER_TILE * inp.settledTileCount + MANPOWER_THROUGHPUT_TARGET_FLOOR;
  const manpowerCeilingPinStart = inp.manpowerCapacity * (1 - CEILING_PIN_BAND);
  const goldTarget = Math.max(GOLD_TARGET_FLOOR, inp.settledTileCount * GOLD_TARGET_PER_TILE) / GOLD_RESCALE_DIVISOR;

  return {
    MANPOWER_THROUGHPUT: clamp01(1 - inp.manpowerRegenPerMinute / manpowerThroughputTarget),
    MANPOWER_CEILING:
      inp.manpowerCapacity <= 0
        ? 0
        : clamp01((inp.manpower - manpowerCeilingPinStart) / (inp.manpowerCapacity * CEILING_PIN_BAND)),
    FOOD_SLOTS: slotDeficit("FOOD", inp.slotSupplyByResource, inp.slotDemandByResource),
    TITANIUM_SLOTS: slotDeficit("TITANIUM", inp.slotSupplyByResource, inp.slotDemandByResource),
    UMBRITE_SLOTS: slotDeficit("UMBRITE", inp.slotSupplyByResource, inp.slotDemandByResource),
    CRYSTAL_SLOTS: slotDeficit("CRYSTAL", inp.slotSupplyByResource, inp.slotDemandByResource),
    GOLD: clamp01(1 - inp.incomePerMinute / goldTarget),
    DEFENSE: clamp01(inp.frontierEnemyTargetCount / Math.max(1, inp.ownedForts * 2)),
    OFFENSE: clamp01(inp.stalematedTargetCount / Math.max(1, inp.ownedSiegeOutposts + 1)),
    VICTORY: clamp01(1 - inp.victoryPathProgress)
  };
};

/**
 * Convenience wrapper for automation-command-planner.ts's planAutomationCommand:
 * extracts computeNeedVector's inputs from an AutomationPlannerInput plus the
 * handful of values it doesn't carry (settledTileCount/incomePerMinute are
 * resolved locals, not always equal to input.settledTileCount/incomePerMinute
 * — see planAutomationCommand's fallback-scan branch; frontierEnemyTargetCount
 * and victoryPathProgress come from the frontier analysis and strategic
 * snapshot computed earlier in that same call). Returns undefined — omitting
 * needVector from the diagnostic entirely — unless all four optional
 * AutomationPlannerInput fields are present (manpowerCapacity,
 * manpowerRegenPerMinute, slotSupplyByResource, slotDemandByResource): see
 * that type's doc comment for why partial data isn't computed from instead.
 */
export const needVectorFromPlannerInput = <TTile extends AutomationPlannerTile>(
  input: AutomationPlannerInput<TTile>,
  locals: {
    settledTileCount: number;
    incomePerMinute: number;
    frontierEnemyTargetCount: number;
    victoryPathProgress: number;
  }
): NeedVector | undefined => {
  if (
    typeof input.manpowerCapacity !== "number" ||
    typeof input.manpowerRegenPerMinute !== "number" ||
    !input.slotSupplyByResource ||
    !input.slotDemandByResource
  ) {
    return undefined;
  }
  return computeNeedVector({
    manpower: input.manpower,
    manpowerCapacity: input.manpowerCapacity,
    manpowerRegenPerMinute: input.manpowerRegenPerMinute,
    settledTileCount: locals.settledTileCount,
    incomePerMinute: locals.incomePerMinute,
    slotSupplyByResource: input.slotSupplyByResource,
    slotDemandByResource: input.slotDemandByResource,
    frontierEnemyTargetCount: locals.frontierEnemyTargetCount,
    stalematedTargetCount: input.attackStalemateTargetTileKeys?.size ?? 0,
    ownedForts: input.ownedStructureCounts?.FORT ?? 0,
    ownedSiegeOutposts: input.ownedStructureCounts?.SIEGE_OUTPOST ?? 0,
    victoryPathProgress: locals.victoryPathProgress
  });
};
