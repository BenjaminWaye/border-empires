import type { PersonalActivityCard } from "@border-empires/game-domain";
import type { FortVariant } from "@border-empires/shared";

import { featuresNote } from "./client-activity-dashboard-features.js";
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

// A variant this client doesn't know (a newer server, or a malformed
// persisted entry) still reads as a sentence rather than "Your undefined".
const defenseLabel = (variant: FortVariant): string => DEFENSE_LABEL[variant] ?? "fortification";

const durationLabel = (ms: number): string => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
};

// Manpower is always the attacking side's loss (defenders pay nothing per
// assault), so only your own attacks show it ("−N manpower", the HUD gauge's
// own word). On rows about attacks on you it was "cost them N manpower": the
// enemy's spending, which returning players read as jargon about their own
// losses. Those rows say who attacked and what you lost instead.
const manpowerPart = (manpowerLoss: number, iAttacked: boolean): string | undefined => {
  if (!iAttacked || !(manpowerLoss > 0)) return undefined;
  return `−${roundedAmount(manpowerLoss)} manpower`;
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
  const defense = card.defenseVariant ? defenseLabel(card.defenseVariant) : undefined;
  const theirs = other ? "their" : undefined;
  // The outcome already names the defense ("Your Palisade fell"), so the note only lists what else stood there.
  const captured = (owner: "your" | "their" | undefined): string => featuresNote(card.capturedFeatures, owner, "with", card.defenseVariant);
  const seized = (owner: "your" | "their" | undefined): string => featuresNote(card.seizedOriginFeatures, owner, "with");
  let outcome: string;
  if (iAttacked && card.attackerWon) {
    outcome = (other ? `Captured ${defense ? `a ${defense} tile` : "a tile"} from ${other}` : "Captured a tile") + captured(theirs);
  } else if (iAttacked) {
    const target = other ? `on ${other}` : "";
    outcome = `Your attack ${target}${target ? " " : ""}was repelled${defense ? ` by their ${defense}` : ""}${card.originSeized ? ` and they seized your launch tile${seized("your")}` : ""}`;
  } else if (card.attackerWon) {
    outcome = `${defense ? `Your ${defense} fell to` : "Lost a tile to"} ${other}${captured("your")}`;
  } else {
    outcome = `${defense ? `Your ${defense} repelled` : "Repelled"} ${other}${card.originSeized ? ` and seized the tile they attacked from${seized("their")}` : ""}`;
  }
  return joinParts([outcome, ...goldParts(iAttacked, card.pillagedGold, card.defenderGoldLoss), manpowerPart(card.manpowerLoss, iAttacked)]);
};

// "Your assault on Maren: 3 attacks, all repelled · −150 manpower"
// "Repelled 3 attacks from Kara · seized 1 of their tiles"
export const combatGroupCardText = (card: CombatGroupCard, playerNames: PlayerNameLookup): string => {
  const other = card.counterpartyPlayerId ? nameOf(card.counterpartyPlayerId, playerNames) : undefined;
  const failed = card.attempts - card.captures;
  const iAttacked = card.role === "ATTACKER";
  const mine = iAttacked ? (other ? "their" : undefined) : "your";
  const theirs = iAttacked ? "your" : "their";
  // Each list sits right after the count it belongs to.
  const captured = featuresNote(card.capturedFeatures, mine, "incl.");
  const seized = featuresNote(card.seizedOriginFeatures, theirs, "incl.");
  let outcome: string;
  if (iAttacked) {
    const assault = other ? `Your assault on ${other}` : "Your assault on unclaimed land";
    outcome = failed === 0
      ? other ? `Took ${plural(card.captures, "tile")} from ${other}${captured}` : `Took ${plural(card.captures, "unclaimed tile")}${captured}`
      : card.captures === 0
        ? `${assault}: ${plural(card.attempts, "attack")}, all repelled`
        : `${assault}: ${plural(card.attempts, "attack")}, ${plural(card.captures, "tile")} taken${captured}`;
    if (card.originsSeized > 0) outcome += ` · they seized ${plural(card.originsSeized, "launch tile")}${seized}`;
  } else {
    const attacker = other ?? "an unknown attacker";
    outcome = failed === 0
      ? `Lost ${plural(card.captures, "tile")}${captured} to ${attacker}`
      : card.captures === 0
        ? `Repelled ${plural(card.attempts, "attack")} from ${attacker}`
        : `${attacker.charAt(0).toUpperCase()}${attacker.slice(1)} attacked ${card.attempts} times: ${failed} repelled, ${plural(card.captures, "tile")} lost${captured}`;
    if (card.originsSeized > 0) outcome += ` · seized ${card.originsSeized} of their tiles${seized}`;
  }
  return joinParts([outcome, ...goldParts(iAttacked, card.pillagedGold, card.defenderGoldLoss), manpowerPart(card.manpowerLoss, iAttacked)]);
};

/**
 * Plain words for repeated attacks on one of your tiles (no "siege",
 * "assault" or the attackers' manpower):
 * "Maren took your Palisade after 1h of attacks (with your Dock) · 3 repelled",
 * "Your Palisade held: repelled 7 attacks from Kael and Vess".
 */
export const siegeHeadline = (card: SiegeCard, playerNames: PlayerNameLookup): string => {
  const target = card.defenseVariant ? `your ${defenseLabel(card.defenseVariant)}` : "your tile";
  if (card.outcome !== "FELL") {
    const attackers = listNames(card.attackerIds.map((id) => nameOf(id, playerNames)));
    return `${target.charAt(0).toUpperCase()}${target.slice(1)} held: repelled ${plural(card.assaultsRepelled, "attack")} from ${attackers}`;
  }
  const taker = card.capturedBy ? nameOf(card.capturedBy, playerNames) : undefined;
  // Only the repelled count is known: the tile can fall to a capture none of the logged assaults made.
  const repelled = card.assaultsRepelled > 0 ? ` · ${card.assaultsRepelled} repelled` : "";
  const over = `after ${durationLabel(card.occurredAt - card.startedAt)} of attacks`;
  const lostWith = featuresNote(card.capturedFeatures, "your", "with", card.defenseVariant);
  return taker ? `${taker} took ${target} ${over}${lostWith}${repelled}` : `Lost ${target} ${over}${lostWith}${repelled}`;
};

/** What you took back while they attacked: "seized 1 of their tiles (incl. their Dock)". */
export const siegeDetail = (card: SiegeCard): string | undefined =>
  card.originsSeized > 0 ? `seized ${card.originsSeized} of their tiles${featuresNote(card.seizedOriginFeatures, "their", "incl.")}` : undefined;

export const siegeCardText = (card: SiegeCard, playerNames: PlayerNameLookup): string => joinParts([siegeHeadline(card, playerNames), siegeDetail(card)]);
