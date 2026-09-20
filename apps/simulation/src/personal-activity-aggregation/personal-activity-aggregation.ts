import { TERRITORY_FLIP_WINDOW_MS, type TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { PERSONAL_ACTIVITY_TIMELINE_CARD_CAP, type PersonalActivityCard, type PersonalActivityTimeline } from "@border-empires/game-domain";
import { groupTerritoryFlipsForPlayer } from "./personal-activity-territory-grouping.js";
import { combatCardsForPlayer } from "./personal-activity-combat-cards.js";
import { capPersonalActivityCards } from "./personal-activity-cap.js";

// Pure aggregation over the existing bounded 24h logs (territory-flip-log,
// combat-manpower-log) into one player's timeline -- see
// docs/activity-dashboard-plan.md 4.1. Phase 0: no personal-impact-log yet
// (Phase 2), so waystation/town/building counts are always 0 and gold
// plunder totals are always 0 until Phase 1 extends CombatManpowerLoss with
// pillagedGold/defenderGoldLoss.
export const aggregatePersonalActivity = (
  playerId: string,
  interval: { from: number; to: number },
  flips: readonly TerritoryFlip[],
  combat: readonly CombatManpowerLoss[]
): PersonalActivityTimeline => {
  const { from, to } = interval;
  const inWindow = (at: number): boolean => at >= from && at <= to;

  const relevantFlips = flips.filter((flip) => inWindow(flip.at) && (flip.toOwner === playerId || flip.fromOwner === playerId));
  const relevantCombat = combat.filter((loss) => inWindow(loss.at) && (loss.attackerId === playerId || loss.defenderId === playerId));

  const territoryCards = groupTerritoryFlipsForPlayer(playerId, relevantFlips);
  const combatCards = combatCardsForPlayer(playerId, relevantCombat);
  const allCards: PersonalActivityCard[] = [...territoryCards, ...combatCards];
  const cards = capPersonalActivityCards(allCards, PERSONAL_ACTIVITY_TIMELINE_CARD_CAP);

  const tilesClaimed = relevantFlips.filter((flip) => flip.toOwner === playerId && flip.fromOwner !== playerId).length;
  const tilesLost = relevantFlips.filter((flip) => flip.fromOwner === playerId && flip.toOwner !== playerId).length;
  const manpowerSpentAttacking = relevantCombat
    .filter((loss) => loss.attackerId === playerId)
    .reduce((sum, loss) => sum + loss.manpowerLoss, 0);

  return {
    playerId,
    from,
    to,
    summary: {
      tilesClaimed,
      tilesLost,
      waystationsActivated: 0,
      townsCaptured: 0,
      townsLost: 0,
      buildingsCompleted: 0
    },
    goldPlundered: 0,
    goldRaidedFromYou: 0,
    manpowerSpentAttacking,
    cards,
    truncated: from < to - TERRITORY_FLIP_WINDOW_MS
  };
};
