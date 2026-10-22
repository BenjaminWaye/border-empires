import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { PersonalActivityCombatCard, PersonalActivityTileFeature } from "@border-empires/game-domain";
import { nonEmptyFeatureCounts } from "./personal-activity-features.js";

export const combatCardsForPlayer = (
  playerId: string,
  combat: readonly CombatManpowerLoss[],
  originSeized: ReadonlySet<CombatManpowerLoss> = new Set(),
  capturedFeatures: ReadonlyMap<CombatManpowerLoss, readonly PersonalActivityTileFeature[]> = new Map()
): PersonalActivityCombatCard[] =>
  combat
    .filter((loss) => loss.attackerId === playerId || loss.defenderId === playerId)
    .map((loss) => {
      const captured = nonEmptyFeatureCounts(capturedFeatures.get(loss) ?? []);
      return {
        kind: "COMBAT",
        id: `combat:${loss.attackerId}:${loss.defenderId ?? "unowned"}:${loss.at}:${loss.x}:${loss.y}`,
        occurredAt: loss.at,
        attackerId: loss.attackerId,
        defenderId: loss.defenderId,
        attackerWon: loss.attackerWon,
        manpowerLoss: loss.manpowerLoss,
        x: loss.x,
        y: loss.y,
        pillagedGold: loss.pillagedGold,
        defenderGoldLoss: loss.defenderGoldLoss,
        targetWasSettled: loss.targetWasSettled,
        ...(loss.defenseVariant ? { defenseVariant: loss.defenseVariant } : {}),
        ...(originSeized.has(loss) ? { originSeized: true } : {}),
        ...(captured ? { capturedFeatures: captured } : {})
      };
    });
