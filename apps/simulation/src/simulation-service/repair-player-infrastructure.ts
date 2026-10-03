import type { SimulationRuntime } from "../runtime/runtime.js";

type ActivePlayer = { id: string; isAi: boolean };

/** AI empires never log in, so they need the same AFC migration at startup
 * and season rollover that PreparePlayer runs for human empires. */
export const repairPlayerInfrastructure = (
  runtime: Pick<SimulationRuntime, "repairZeroGrossIncomeSettlements" | "ensurePlayerHasAfc">,
  activePlayers: Map<string, ActivePlayer>,
  incomeRepairCandidates?: string[]
): void => {
  if (incomeRepairCandidates) {
    for (const id of runtime.repairZeroGrossIncomeSettlements(incomeRepairCandidates).aiPlayerIds) {
      activePlayers.set(id, { id, isAi: true });
    }
  }
  for (const player of activePlayers.values()) {
    if (player.isAi) runtime.ensurePlayerHasAfc(player.id);
  }
};
