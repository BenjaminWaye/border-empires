import { techGoldCostForResearchedCount } from "@border-empires/shared";
import type { DomainPlayer } from "@border-empires/game-domain";

/**
 * Calculating Engine wonder: -10% (rounding up) on a tech's gold cost. Shared by research and the displayed catalog.
 */
export const goldCostForTechResearch = (
  player: Pick<DomainPlayer, "techIds" | "wonderTechGoldDiscount">
): number => {
  const base = techGoldCostForResearchedCount(player.techIds.size);
  const discount = player.wonderTechGoldDiscount ?? 0;
  return Math.max(0, Math.ceil(base * (1 - discount)));
};
