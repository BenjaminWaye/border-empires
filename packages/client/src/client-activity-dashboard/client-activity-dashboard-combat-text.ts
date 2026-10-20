import type { PersonalActivityCard } from "@border-empires/game-domain";
import type { FortVariant } from "@border-empires/shared";

import { listNames, nameOf, plural, roundedAmount, type PlayerNameLookup } from "./client-activity-dashboard-names.js";

type CombatCard = Extract<PersonalActivityCard, { kind: "COMBAT" }>;
type CombatGroupCard = Extract<PersonalActivityCard, { kind: "COMBAT_GROUP" }>;
type SiegeCard = Extract<PersonalActivityCard, { kind: "SIEGE" }>;

const DEFENSE_LABEL: Record<FortVariant, string> = {
  PALISADE: "Palisade",
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion"
};

const durationLabel = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return minutes < 60 ? `${minutes}m` : `${Math.round(minutes / 60)}h`;
};

// Manpower is always the attacking side's loss (defenders pay nothing per
// assault), so it reads as "−N manpower" on your attacks and "cost them N"
// on theirs. Omitted when there was no cost to report.
const manpowerPart = (manpowerLoss: number, iAttacked: boolean): string | undefined => {
  if (!(manpowerLoss > 0)) return undefined;
  return iAttacked ? `−${roundedAmount(manpowerLoss)} manpower` : `cost them ${roundedAmount(manpowerLoss)} manpower`;
};

const goldParts = (iAttacked: boolean, pillagedGold: number, defenderGoldLoss: number): string[] => {
  if (iAttacked && roundedAmount(pillagedGold) > 0) return [`+${roundedAmount(pillagedGold)} coin plundered`];
  if (!iAttacked && roundedAmount(defenderGoldLoss) > 0) return [`−${roundedAmount(defenderGoldLoss)} coin raided from you`];
  return [];
};

const joinParts = (parts: Array<string | undefined>): string => parts.filter((part): part is string => Boolean(part)).join(" · ");

export const combatCardText = (card: CombatCard, playerId: string, playerNames: PlayerNameLookup): string => {
  const iAttacked = card.attackerId === playerId;
  const otherId = iAttacked ? card.defenderId : card.attackerId;
  const other = otherId ? nameOf(otherId, playerNames) : undefined;
  const defense = card.defenseVariant ? DEFENSE_LABEL[card.defenseVariant] : undefined;
  let outcome: string;
  if (iAttacked && card.attackerWon) {
    outcome = other ? `Captured ${defense ? `a ${defense} tile` : "a tile"} from ${other}` : "Captured a tile";
  } else if (iAttacked) {
    const target = other ? `on ${other}` : "";
    outcome = `Your attack ${target}${target ? " " : ""}was repelled${defense ? ` by their ${defense}` : ""}${card.originSeized ? " and they seized your launch tile" : ""}`;
  } else if (card.attackerWon) {
    outcome = `${defense ? `Your ${defense} fell to` : "Lost a tile to"} ${other}`;
  } else {
    outcome = `${defense ? `Your ${defense} repelled` : "Repelled"} ${other}${card.originSeized ? " and seized the tile they attacked from" : ""}`;
  }
  return joinParts([outcome, ...goldParts(iAttacked, card.pillagedGold, card.defenderGoldLoss), manpowerPart(card.manpowerLoss, iAttacked)]);
};

// "Your assault on Maren: 3 attacks, all repelled · −150 manpower"
// "Repelled 3 attacks from Kara and seized 1 of their tiles · cost them 150 manpower"
export const combatGroupCardText = (card: CombatGroupCard, playerNames: PlayerNameLookup): string => {
  const other = card.counterpartyPlayerId ? nameOf(card.counterpartyPlayerId, playerNames) : "unclaimed land";
  const failed = card.attempts - card.captures;
  const iAttacked = card.role === "ATTACKER";
  let outcome: string;
  if (iAttacked) {
    outcome = failed === 0
      ? `Took ${plural(card.captures, "tile")} from ${other}`
      : card.captures === 0
        ? `Your assault on ${other}: ${plural(card.attempts, "attack")}, all repelled`
        : `Your assault on ${other}: took ${card.captures} of ${plural(card.attempts, "tile")}`;
    if (card.originsSeized > 0) outcome += ` · they seized ${plural(card.originsSeized, "launch tile")}`;
  } else {
    outcome = failed === 0
      ? `Lost ${plural(card.captures, "tile")} to ${other}`
      : card.captures === 0
        ? `Repelled ${plural(card.attempts, "attack")} from ${other}`
        : `${other} attacked ${card.attempts} times: ${failed} repelled, ${plural(card.captures, "tile")} lost`;
    if (card.originsSeized > 0) outcome += ` · seized ${card.originsSeized} of their tiles`;
  }
  return joinParts([outcome, ...goldParts(iAttacked, card.pillagedGold, card.defenderGoldLoss), manpowerPart(card.manpowerLoss, iAttacked)]);
};

/** "Your Fort fell after a 5h siege" / "Your Palisade is holding". */
export const siegeHeadline = (card: SiegeCard): string => {
  const defense = card.defenseVariant ? `Your ${DEFENSE_LABEL[card.defenseVariant]}` : "Your tile";
  return card.outcome === "FELL" ? `${defense} fell after a ${durationLabel(card.occurredAt - card.startedAt)} siege` : `${defense} is holding`;
};

/** "Held off 7 assaults from Kael and Vess · cost them 412 manpower". */
export const siegeDetail = (card: SiegeCard, playerNames: PlayerNameLookup): string => {
  const attackers = listNames(card.attackerIds.map((id) => nameOf(id, playerNames)));
  return `${card.outcome === "FELL" ? "Held off" : "Repelled"} ${plural(card.assaultsRepelled, "assault")} from ${attackers} · cost them ${roundedAmount(card.manpowerSpentAgainst)} manpower`;
};

export const siegeCardText = (card: SiegeCard, playerNames: PlayerNameLookup): string => `${siegeHeadline(card)} · ${siegeDetail(card, playerNames)}`;
