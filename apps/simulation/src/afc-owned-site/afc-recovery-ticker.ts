import type { RuntimeStructureCommandContext } from "../runtime-structure-command-handlers.js";
import { handleBuildStructureCommand } from "../runtime-structure-command-handlers.js";
import { planAiAfcReplacement } from "../ai/ai-afc-recovery.js";
import { tickAfcDeliveries } from "./afc-recovery.js";

/** A single throttle per runtime; delivery state lives on players, not in timers. */
export function createAfcRecoveryTicker(contextFor: () => RuntimeStructureCommandContext): (nowMs: number) => void {
  let nextPlanAt = 0;
  return nowMs => {
    const context = contextFor();
    tickAfcDeliveries(context, nowMs);
    if (nowMs < nextPlanAt) return;
    nextPlanAt = nowMs + 15_000;
    for (const player of context.players.values()) {
      const command = planAiAfcReplacement(context, player);
      if (command) handleBuildStructureCommand(context, command);
    }
  };
}
