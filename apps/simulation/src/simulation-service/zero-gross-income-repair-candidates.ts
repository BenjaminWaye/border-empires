import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";

// Extracted out of simulation-service.ts (already over the repo's 500-line
// file cap — see AGENTS.md's file-line-limit rule) so adding rival-reach-push
// wiring doesn't grow that file further.
export const zeroGrossIncomeRepairCandidateIds = (initialState: RecoveredSimulationState | undefined): string[] => {
  const ids = new Set<string>();
  for (const player of initialState?.players ?? []) ids.add(player.id);
  for (const tile of initialState?.tiles ?? []) {
    if (tile.ownerId) ids.add(tile.ownerId);
  }
  return [...ids];
};
