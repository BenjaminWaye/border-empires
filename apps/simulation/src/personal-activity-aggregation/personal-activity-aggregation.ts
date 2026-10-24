import { TERRITORY_FLIP_WINDOW_MS, type TerritoryFlip } from "../territory-flip-log/territory-flip-log.js";
import type { CombatManpowerLoss } from "../combat-manpower-log/combat-manpower-log.js";
import { PERSONAL_ACTIVITY_TIMELINE_CARD_CAP, type PersonalActivityCard, type PersonalActivityTimeline } from "@border-empires/game-domain";
import { groupTerritoryFlipsForPlayer } from "./personal-activity-territory-grouping.js";
import { combatCardsWithGroups } from "./personal-activity-combat-groups.js";
import { matchCombatToFlips, type KnownCapture } from "./personal-activity-flip-matching.js";
import { rivalsForPlayer } from "./personal-activity-rivals.js";
import { siegeCardsForDefender } from "./personal-activity-siege-cards.js";
import { capPersonalActivityCards } from "./personal-activity-cap.js";
import { personalImpactCardsForPlayer } from "./personal-activity-impact-cards.js";
import { viewerFeatureCounts } from "./personal-activity-features.js";
import type { PersonalImpactEvent } from "../personal-impact-log/personal-impact-log.js";

// Pure aggregation over the existing bounded 24h logs (territory-flip-log,
// combat-manpower-log) into one player's timeline -- see
// docs/activity-dashboard-plan.md 4.1. Phase 0: no personal-impact-log yet
// (Phase 2), so waystation/town/building counts are always 0. Gold plunder
// totals are real as of Phase 1, summed from CombatManpowerLoss's
// pillagedGold/defenderGoldLoss (0 for any non-settled-capture combat).
export const aggregatePersonalActivity = (
  playerId: string,
  interval: { from: number; to: number },
  flips: readonly TerritoryFlip[],
  combat: readonly CombatManpowerLoss[],
  personalImpacts: readonly PersonalImpactEvent[] = []
): PersonalActivityTimeline => {
  const { from, to } = interval;
  const inWindow = (at: number): boolean => at >= from && at <= to;

  const relevantFlips = flips.filter((flip) => inWindow(flip.at) && (flip.toOwner === playerId || flip.fromOwner === playerId));
  const loggedCombat = combat.filter((loss) => inWindow(loss.at) && (loss.attackerId === playerId || loss.defenderId === playerId));
  const relevantImpacts = personalImpacts.filter((event) => inWindow(event.occurredAt));

  const knownCaptures: KnownCapture[] = relevantImpacts.flatMap((event) =>
    event.kind === "TOWN_LOST" || event.kind === "DOCK_LOST"
      ? [{ x: event.x, y: event.y, at: event.occurredAt, defenderId: event.playerId, ...(event.counterpartyPlayerId ? { attackerId: event.counterpartyPlayerId } : {}) }]
      : []);
  const matches = matchCombatToFlips(loggedCombat, relevantFlips, to, knownCaptures);
  const relevantCombat = matches.combat;
  const territoryCards = groupTerritoryFlipsForPlayer(playerId, relevantFlips.filter((flip) => !matches.consumedFlips.has(flip)));
  const sieges = siegeCardsForDefender(playerId, relevantCombat, matches.originSeized, matches.tileFeatures);
  const combatCards = combatCardsWithGroups(playerId, relevantCombat.filter((loss) => !sieges.consumed.has(loss)), matches.originSeized, matches.tileFeatures);
  const impactCards = personalImpactCardsForPlayer(playerId, relevantImpacts);
  const allCards: PersonalActivityCard[] = [...territoryCards, ...combatCards, ...sieges.cards, ...impactCards.waystations, ...impactCards.towns, ...impactCards.docks, ...impactCards.buildings];
  const cards = capPersonalActivityCards(allCards, PERSONAL_ACTIVITY_TIMELINE_CARD_CAP);

  const claimedFlips = relevantFlips.filter((flip) => flip.toOwner === playerId && flip.fromOwner !== playerId);
  const lostFlips = relevantFlips.filter((flip) => flip.fromOwner === playerId && flip.toOwner !== playerId);
  // Every flip, like the tile counts: what fell is named up top even when its
  // card was folded into a combat card or dropped by the card cap.
  const featuresLost = viewerFeatureCounts(lostFlips.flatMap((flip) => flip.features ?? []), false);
  const featuresCaptured = viewerFeatureCounts(claimedFlips.filter((flip) => flip.fromOwner !== undefined).flatMap((flip) => flip.features ?? []), true);
  const manpowerSpentAttacking = relevantCombat
    .filter((loss) => loss.attackerId === playerId)
    .reduce((sum, loss) => sum + loss.manpowerLoss, 0);
  const goldPlundered = relevantCombat
    .filter((loss) => loss.attackerId === playerId)
    .reduce((sum, loss) => sum + loss.pillagedGold, 0);
  const goldRaidedFromYou = relevantCombat
    .filter((loss) => loss.defenderId === playerId)
    .reduce((sum, loss) => sum + loss.defenderGoldLoss, 0);

  return {
    playerId,
    from,
    to,
    summary: {
      tilesClaimed: claimedFlips.length,
      tilesLost: lostFlips.length,
      waystationsActivated: impactCards.waystations.length,
      townsCaptured: impactCards.towns.filter((card) => card.kind === "TOWN_CAPTURED").length,
      townsLost: impactCards.towns.filter((card) => card.kind === "TOWN_LOST").length,
      buildingsCompleted: impactCards.buildings.length,
      ...(featuresLost ? { featuresLost } : {}),
      ...(featuresCaptured ? { featuresCaptured } : {})
    },
    goldPlundered,
    goldRaidedFromYou,
    manpowerSpentAttacking,
    cards,
    rivals: rivalsForPlayer(playerId, relevantFlips, relevantCombat),
    truncated: from < to - TERRITORY_FLIP_WINDOW_MS
  };
};
