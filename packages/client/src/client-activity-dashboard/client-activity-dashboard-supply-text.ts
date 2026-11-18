import type { PersonalActivitySupplyEndedCard } from "@border-empires/game-domain";
import { supplyResourceLabel, TRADABLE_SUPPLY_RESOURCES, type ResourceSupplyOffer } from "@border-empires/shared";

import { listNames, nameOf, type PlayerNameLookup } from "./client-activity-dashboard-names.js";

// A resource supply deal ending, in words: what stopped flowing, between whom,
// and why. Persona playtest: an ally's food supply stopped with no record and
// the player's newest town went unfed without them knowing.

/** "2 food and 1 luxury biota", or undefined for an empty side. */
export const supplyAmountsText = (offer: ResourceSupplyOffer): string | undefined => {
  const parts = TRADABLE_SUPPLY_RESOURCES
    .filter((resource) => (offer[resource] ?? 0) > 0)
    .map((resource) => `${offer[resource]} ${supplyResourceLabel(resource).toLowerCase()}`);
  return parts.length > 0 ? listNames(parts) : undefined;
};

const reasonText = (card: PersonalActivitySupplyEndedCard, playerId: string, other: string): string => {
  if (card.reason === "SUSPENDED") return "the promised supply is unavailable. The deal can resume when supply returns";
  if (card.reason === "EXPIRED") return "its time ran out";
  const byMe = card.byPlayerId === playerId;
  if (card.reason === "ATTACK") return byMe ? `you attacked ${other}` : `${other} attacked you`;
  return byMe ? "you ended it" : `${other} ended it`;
};

export const supplyEndedCardText = (card: PersonalActivitySupplyEndedCard, playerId: string, playerNames: PlayerNameLookup): string => {
  const other = nameOf(card.counterpartyPlayerId, playerNames);
  const got = supplyAmountsText(card.youGot);
  const gave = supplyAmountsText(card.youGave);
  const what = got
    ? `${other}'s supply of ${got} to you stopped`
    : gave ? `Your supply of ${gave} to ${other} stopped` : `Supply deal with ${other} ended`;
  return `${what} · ${reasonText(card, playerId, other)}`;
};
