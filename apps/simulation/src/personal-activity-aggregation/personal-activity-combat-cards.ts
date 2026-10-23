import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import type { PersonalActivityCombatCard } from "@border-empires/game-domain";
import { NO_COMBAT_TILE_FEATURES, viewerFeatureCounts, type CombatTileFeatures } from "./personal-activity-features.js";

export const combatCardsForPlayer = (
  playerId: string,
  combat: readonly CombatManpowerLoss[],
  originSeized: ReadonlySet<CombatManpowerLoss> = new Set(),
  tileFeatures: CombatTileFeatures = NO_COMBAT_TILE_FEATURES
): PersonalActivityCombatCard[] =>
  combat
    .filter((loss) => loss.attackerId === playerId || loss.defenderId === playerId)
    .map((loss) => {
      const iAttacked = loss.attackerId === playerId;
      // The attacker took the target; the defender took the seized launch tile.
      const captured = viewerFeatureCounts(tileFeatures.captured.get(loss), iAttacked);
      const seized = viewerFeatureCounts(tileFeatures.seizedOrigin.get(loss), !iAttacked);
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
        ...(captured ? { capturedFeatures: captured } : {}),
        ...(seized ? { seizedOriginFeatures: seized } : {})
      };
    });
