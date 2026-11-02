import type { DomainPlayer } from "@border-empires/game-domain";
import { DEVELOPMENT_PROCESS_LIMIT } from "@border-empires/shared";
import { additiveEffectForPlayer } from "./tech-domain-bridge/tech-domain-bridge.js";

/**
 * A player's concurrent development slots: the base limit plus relic and
 * tech/domain capacity bonuses. An unknown player gets the base limit.
 * Shared by the runtime's slot gate and PLAYER_UPDATE's developmentProcessLimit
 * so the two can't drift.
 */
export const developmentProcessLimitForPlayer = (
  player: (Pick<DomainPlayer, "techIds" | "domainIds"> & { relicDevelopmentBonus?: number }) | undefined
): number =>
  DEVELOPMENT_PROCESS_LIMIT +
  (player?.relicDevelopmentBonus ?? 0) +
  (player ? additiveEffectForPlayer(player, "developmentProcessCapacityAdd") : 0);
