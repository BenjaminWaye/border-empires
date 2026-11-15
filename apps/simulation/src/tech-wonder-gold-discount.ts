import { techGoldCostForResearchedCount } from "@border-empires/shared";
import type { DomainPlayer } from "@border-empires/game-domain";

/**
 * Calculating Engine wonder: -10% (rounding up) on a tech's gold cost. Pulled
 * out of tech-domain-bridge.ts to keep that file from growing past its
 * existing size — this is the only caller.
 */
export const goldCostForTechResearch = (
  player: Pick<DomainPlayer, "techIds" | "wonderTechGoldDiscount">,
  _tech: { cost?: { gold?: number } }
): number => {
  const base = techGoldCostForResearchedCount(player.techIds.size);
  const discount = player.wonderTechGoldDiscount ?? 0;
  return Math.max(0, Math.ceil(base * (1 - discount)));
};
