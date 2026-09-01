// Split out of automation-command-planner.ts (which was already at the
// repo's 500-line cap) once the war-reserve computation and its rationale
// grew large enough to justify its own file.
import { aiWarReserveManpower } from "@border-empires/shared";

import type { AutomationPlannerInput, AutomationPlannerTile } from "./automation-command-planner-types.js";

/**
 * War reserve (docs/ai-war-peace-balance-plan.md): a floor on spendable
 * manpower an AI player must keep in reserve for attacking — EXPAND, SETTLE,
 * and structure builds may not spend below it, but ATTACK is exempt (the
 * reserve exists to be spent attacking, not sit idle, so callers computing
 * canAttack must use input.manpower directly, never this function). AI
 * players only, never barbarians/system-runtime.
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
  input: Pick<AutomationPlannerInput<AutomationPlannerTile>, "sessionPrefix" | "manpowerCapacity" | "manpower">
): number => {
  const reserve =
    input.sessionPrefix === "ai-runtime" && typeof input.manpowerCapacity === "number"
      ? aiWarReserveManpower(input.manpowerCapacity)
      : 0;
  return Math.max(0, input.manpower - reserve);
};
