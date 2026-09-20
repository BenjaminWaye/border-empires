import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { PersonalActivityCombatCard } from "@border-empires/game-domain";

export const combatCardsForPlayer = (playerId: string, combat: readonly CombatManpowerLoss[]): PersonalActivityCombatCard[] =>
  combat
    .filter((loss) => loss.attackerId === playerId || loss.defenderId === playerId)
    .map((loss) => ({
      kind: "COMBAT",
      id: `combat:${loss.attackerId}:${loss.defenderId ?? "unowned"}:${loss.at}:${loss.x}:${loss.y}`,
      occurredAt: loss.at,
      attackerId: loss.attackerId,
      defenderId: loss.defenderId,
      attackerWon: loss.attackerWon,
      manpowerLoss: loss.manpowerLoss,
      x: loss.x,
      y: loss.y
    }));
