import type { DomainPlayer } from "@border-empires/game-domain";
import { additiveEffectForPlayer } from "../tech-domain-bridge/tech-domain-bridge.js";

// Connected-town coin bonus ladder (+50% / +40% / +30% for the first three
// connected towns, each step raised by connectedTownStepBonusAdd). Split out
// of economy-network.ts so that oversized module can keep shrinking.
const connectedTownStepCount = (connectedTownCount: number): number => Math.max(0, Math.min(3, connectedTownCount));

export const connectedTownBonusForPlayer = (
  connectedTownCount: number,
  player: Pick<DomainPlayer, "techIds" | "domainIds">
): number => {
  const stepCount = connectedTownStepCount(connectedTownCount);
  if (stepCount <= 0) return 0;
  const stepBonusAdd = additiveEffectForPlayer(player, "connectedTownStepBonusAdd");
  return [0.5, 0.4, 0.3]
    .slice(0, stepCount)
    .reduce((total, baseStep) => total + baseStep + stepBonusAdd, 0);
};
