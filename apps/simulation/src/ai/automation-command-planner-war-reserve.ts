// Split out of automation-command-planner.ts (which was already at the
// repo's 500-line cap) once the war-reserve computation and its rationale
// grew large enough to justify its own file.
import { aiWarReserveManpower } from "@border-empires/shared";

import { AI_BUILD_MANPOWER_FLOOR } from "../ai-build-manpower-floor.js";
import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";

/**
 * War reserve (docs/ai-war-peace-balance-plan.md): a floor on spendable
 * manpower an AI player must keep in reserve for attacking — EXPAND, SETTLE,
 * and structure builds may not spend below it, but ATTACK is exempt (the
 * reserve exists to be spent attacking, not sit idle, so callers computing
 * canAttack must use input.manpower directly, never this function). AI
 * players only, never barbarians/system-runtime.
 *
 * Manpower already staged inside the player's muster flags counts toward the
 * reserve: the flag IS how the AI spends its reserve attacking (ADVANCE/MARCH
 * auto-fire draws from it), so requiring the pool to hold a second 120 on top
 * of a full flag double-counts and — with the muster tick draining the pool
 * into the flag — made builds unaffordable forever (staging ai-2, 2026-09-25:
 * pool 0.2, flag capacity 104, Relay Beacon needing ~150 in the pool). With
 * staged >= reserve the pool is fully spendable; with less, only the shortfall
 * stays reserved, so war staging still comes first.
 *
 * Confirmed live (2026-09-01): AI empires spent every point of manpower
 * regen on EXPAND (unlocked at EXPAND_MANPOWER_COST, 10) and could
 * mathematically never accumulate the 60 needed for ATTACK_MANPOWER_MIN —
 * they had no way to ever fight back, including against sustained
 * barbarian pressure. Falls back to 0 reservation when manpowerCapacity
 * isn't supplied (e.g. a direct unit-test call), matching the pattern of
 * every other optional AutomationPlannerInput field.
 */
export const spendableManpowerForPlanner = (
  input: Pick<
    AutomationPlannerInput<AutomationPlannerTile>,
    "sessionPrefix" | "manpowerCapacity" | "manpower" | "musterStagedManpower"
  >
): number => {
  const reserve =
    input.sessionPrefix === "ai-runtime" && typeof input.manpowerCapacity === "number"
      ? Math.max(0, aiWarReserveManpower(input.manpowerCapacity) - (input.musterStagedManpower ?? 0))
      : 0;
  return Math.max(0, input.manpower - reserve);
};

/**
 * Spendable manpower for STRUCTURE builds only (not EXPAND, which stays gated
 * by spendableManpowerForPlanner): the war-reserved amount, but never less than
 * min(pool, AI_BUILD_MANPOWER_FLOOR). The muster tick leaves that much in the
 * pool for builds (see ai-build-manpower-floor.ts); without this carve-out a
 * flag that never holds the full reserve would leave the floor unspendable.
 */
export const spendableBuildManpowerForPlanner = (
  input: Pick<
    AutomationPlannerInput<AutomationPlannerTile>,
    "sessionPrefix" | "manpowerCapacity" | "manpower" | "musterStagedManpower"
  >
): number => {
  const spendable = spendableManpowerForPlanner(input);
  if (input.sessionPrefix !== "ai-runtime" || typeof input.manpowerCapacity !== "number") return spendable;
  return Math.max(spendable, Math.min(Math.max(0, input.manpower), AI_BUILD_MANPOWER_FLOOR));
};
