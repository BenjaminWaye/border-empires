// The season-end charge reward (docs/house-charges-plan.md, "Rewards"): when a
// Sector Contest is crowned, the House collects the charges it held as cards,
// each banking Domain score by its difficulty pips. Pure data helpers: which cards this
// House earned (numbered exactly as GET /hq/house-charges/cards numbers them),
// how much Domain score they bank, and whether the reward was already collected.
import { houseChargeDomainForPips, houseChargeDomainWeight, type HouseChargeRarity } from "@border-empires/shared";
import type { HouseChargeCardView } from "../client-house-charges/client-house-charge-cards.js";
import type { HouseChargeRevealView } from "../client-house-charges/client-house-charge-reveal.js";

export type ChargeRewardCard = { card: HouseChargeCardView; domain: number };

export type ChargeReward = {
  seasonId: string;
  seasonSequence: number;
  /** Held charges, rarest first so the sequence builds to its biggest card last. */
  cards: ChargeRewardCard[];
  /** Domain score this contest banked. */
  gained: number;
  /** Charges the House kept this contest, held or not. */
  kept: number;
};

const RARITY_ORDER = { COMMON: 0, RARE: 1, MYTHIC: 2 } as const;

/** The crowned contest's cards for every House, numbered in the server's stable order (player, then charge id). */
export const revealCards = (view: HouseChargeRevealView): HouseChargeCardView[] => {
  const held = view.houses
    .flatMap((house) => house.charges.filter((charge) => charge.held).map((charge) => ({ house, charge })))
    .sort((a, b) => a.house.playerId.localeCompare(b.house.playerId) || a.charge.id.localeCompare(b.charge.id));
  return held.map(({ house, charge }, index) => ({
    ...charge,
    seasonId: view.seasonId,
    seasonSequence: view.seasonSequence,
    endedAt: view.endedAt,
    playerId: house.playerId,
    playerName: house.playerName,
    collectorNumber: index + 1,
    collectorTotal: held.length,
    foil: view.winnerPlayerId === house.playerId
  }));
};

/** This House's reward from the reveal, or undefined when it held no charge at the crowning. */
export const chargeRewardFor = (view: HouseChargeRevealView, selfId: string | undefined): ChargeReward | undefined => {
  if (!selfId) return undefined;
  const house = view.houses.find((entry) => entry.playerId === selfId);
  const cards = revealCards(view)
    .filter((card) => card.playerId === selfId)
    .map((card) => ({ card, domain: houseChargeDomainWeight(card) }))
    // Stable: equal rarities keep collector order.
    .sort((a, b) => RARITY_ORDER[a.card.rarity] - RARITY_ORDER[b.card.rarity]);
  if (!house || cards.length === 0) return undefined;
  return {
    seasonId: view.seasonId,
    seasonSequence: view.seasonSequence,
    cards,
    gained: cards.reduce((sum, entry) => sum + entry.domain, 0),
    kept: house.charges.length
  };
};

/**
 * Domain score before and after this contest. `total` is the account's banked
 * charge Domain score from GET /hq/galaxy/me, which already includes this
 * crowning; unknown (guest, offline) counts up from 0 to what was gained.
 */
export const domainCountRange = (total: number | undefined, gained: number): { from: number; to: number } => {
  if (total === undefined || !Number.isFinite(total) || total < gained) return { from: 0, to: gained };
  return { from: total - gained, to: total };
};

/** "Rare · +3 Domain": the card's rarity and the Domain score its difficulty pips bank. */
export const rarityDomainLabel = (card: { readonly rarity: HouseChargeRarity; readonly renown: number }): string =>
  `${card.rarity.charAt(0)}${card.rarity.slice(1).toLowerCase()} · +${houseChargeDomainForPips(card.renown)} Domain`;

const collectedKey = (seasonId: string): string => `be-charge-reward-collected:${seasonId}`;

/** Whether this browser already collected the reward for `seasonId`; storage failures count as not collected. */
export const isChargeRewardCollected = (seasonId: string): boolean => {
  try {
    return window.localStorage.getItem(collectedKey(seasonId)) === "1";
  } catch {
    return false;
  }
};

export const markChargeRewardCollected = (seasonId: string): void => {
  try {
    window.localStorage.setItem(collectedKey(seasonId), "1");
  } catch {
    // Private mode / blocked storage: the reward may show again next visit, which is harmless.
  }
};
