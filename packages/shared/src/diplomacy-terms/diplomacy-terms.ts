import { resourceSupplyCoinValue, missingResourceSupply, clampedResourceSupply, RESOURCE_SUPPLY_COIN_VALUE_PER_DAY } from "../resource-supply-trades/resource-supply-valuation.js";
// Terms attached to a truce or alliance offer, and the pure rules an AI uses
// to price them. Shared so the client's live "would they accept?" preview
// and the gateway's real decision run the exact same arithmetic.
//
// Upfront Coin settles once; optional resource and income terms are continuing
// commitments, backed by actual production instead of stockpile deductions.
import { z } from "zod";
import { RESOURCE_SUPPLY_TRADE_DAYS, TradeCoinPerHourSchema, ResourceSupplyOfferSchema, hasResourceSupplyOffer, supplyResourceLabel, TRADABLE_SUPPLY_RESOURCES } from "../resource-supply-trades/resource-supply-trades.js";
import { DiplomacyTownListSchema, hasTowns, returnsPricedTown, townRefKey, townsLabel, townsToCover, townsValueToAi, type DiplomacyTownRef, type PricedTown } from "./diplomacy-town-return.js";

export type DiplomacyOfferKind = "truce" | "alliance";
export type DiplomacyGoods = z.infer<typeof DiplomacyGoodsSchema>;

/** From the proposer's point of view: `give` goes to the target, `ask` comes from the target. */
export type DiplomacyTerms = z.infer<typeof DiplomacyTermsSchema>;

/** Per-item cap on a single offer -- far above any real stockpile, but rules out absurd payloads. */
export const MAX_DIPLOMACY_TERM_AMOUNT = 1_000_000;

export const DiplomacyGoodsSchema = z.object({
  gold: z.number().int().min(0).max(MAX_DIPLOMACY_TERM_AMOUNT),
  resources: ResourceSupplyOfferSchema.optional(),
  coinPerHour: TradeCoinPerHourSchema.optional(),
  /** Towns handed back to the other side (diplomacy-town-return.ts): truces and gifts only. */
  towns: DiplomacyTownListSchema.optional()
});
export const DiplomacyTermsSchema = z.object({
  give: DiplomacyGoodsSchema, ask: DiplomacyGoodsSchema,
  // Accepted for older callers; new supply commitments have a fixed seven-day term.
  supplyDurationHours: z.union([z.literal(12), z.literal(24)]).optional()
});

/**
 * Outside a truce, Coin per hour rides on a resource supply contract, so it
 * needs a slot in the deal. ALLIANCE_REQUEST and RESOURCE_TRADE_REQUEST
 * refine their terms with this; a truce may pledge Coin per hour alone.
 */
export const recurringCoinHasSlot = (terms: DiplomacyTerms): boolean =>
  !hasRecurringCoin(terms) || hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources);
export const RECURRING_COIN_NEEDS_SLOT_MESSAGE = "Recurring Coin requires a resource slot in the deal.";

/**
 * Marks a truce/alliance request as a counter to an offer the sender received:
 * the gateway rejects that offer (without a re-offer cooldown) in the same step,
 * so "their offer is gone" and "my counter is pending" can't race.
 */
export type DiplomacyCounterRef = { kind: DiplomacyOfferKind; requestId: string };
export const DiplomacyCounterRefSchema = z.object({ kind: z.enum(["truce", "alliance"]), requestId: z.string().min(1) });

/**
 * True when raw persisted terms (pre-parse JSON) still carry a Shard amount.
 * Shards were removed from the game; parsing would silently drop the amount
 * and turn a Shard-paid offer into a cheaper or free one, so stores drop such
 * offers instead.
 */
export const diplomacyTermsCarryRetiredShards = (raw: unknown): boolean => {
  if (!raw || typeof raw !== "object") return false;
  const sides = raw as { give?: { shard?: unknown }; ask?: { shard?: unknown } };
  const amount = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);
  return amount(sides.give?.shard) > 0 || amount(sides.ask?.shard) > 0;
};

export const EMPTY_DIPLOMACY_GOODS: DiplomacyGoods = { gold: 0 };
export const emptyDiplomacyTerms = (): DiplomacyTerms => ({ give: { ...EMPTY_DIPLOMACY_GOODS }, ask: { ...EMPTY_DIPLOMACY_GOODS } });

export const hasRecurringCoin = (terms: DiplomacyTerms): boolean => Boolean(terms.give.coinPerHour || terms.ask.coinPerHour);

/**
 * How many hours Coin per hour is paid for: the seven-day supply term when the
 * deal carries resource slots, otherwise the truce's own length (a 12h
 * extension pays for 12h from acceptance). null when the deal can't carry it.
 */
export const recurringCoinTermHours = (kind: DiplomacyOfferKind | "trade", durationHours: 12 | 24, terms: DiplomacyTerms): number | null =>
  hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources)
    ? RESOURCE_SUPPLY_TRADE_DAYS * 24
    : kind === "truce" ? durationHours : null;

export const diplomacyTermsAreEmpty = (terms: DiplomacyTerms | undefined): boolean =>
  !terms || (terms.give.gold === 0 && terms.ask.gold === 0 && !hasRecurringCoin(terms) &&
    !hasResourceSupplyOffer(terms.give.resources) && !hasResourceSupplyOffer(terms.ask.resources) &&
    !hasTowns(terms.give.towns) && !hasTowns(terms.ask.towns));

/** Deals that hand back a town: only a truce or a gift may (never an alliance or a resource trade). */
export const termsReturnTowns = (terms: DiplomacyTerms): boolean => hasTowns(terms.give.towns) || hasTowns(terms.ask.towns);
export const TOWNS_ONLY_IN_TRUCES_MESSAGE = "Towns can only be returned in a truce or as a gift.";

const copyGoods = (goods: DiplomacyGoods): DiplomacyGoods => ({
  ...goods,
  ...(goods.resources ? { resources: { ...goods.resources } } : {}),
  ...(goods.towns ? { towns: goods.towns.map((town) => ({ ...town })) } : {})
});

/** The same deal seen from the other side. */
export const swapDiplomacyTerms = (terms: DiplomacyTerms): DiplomacyTerms => ({
  give: copyGoods(terms.ask),
  ask: copyGoods(terms.give),
  ...(terms.supplyDurationHours ? { supplyDurationHours: terms.supplyDurationHours } : {})
});

/** Deals with continuing terms label upfront Coin "lump sum" so it can't be read as Coin per hour. */
const hasContinuingTerms = (terms: DiplomacyTerms): boolean =>
  hasRecurringCoin(terms) || hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources);
/** Looks up a town's name for deal text; the terms themselves carry only its tile. */
export type TownNameLookup = (town: DiplomacyTownRef) => string | undefined;

const goodsLabel = (goods: DiplomacyGoods, lumpSum = false, townName?: TownNameLookup): string => {
  const parts: string[] = [];
  if (goods.gold > 0) parts.push(`${goods.gold} coin${lumpSum ? " lump sum" : ""}`);
  if (goods.coinPerHour) parts.push(`up to ${goods.coinPerHour} coin/hour from income`);
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    const count = goods.resources?.[resource] ?? 0;
    if (count > 0) parts.push(`${count} ${supplyResourceLabel(resource)} supply ${count === 1 ? "slot" : "slots"}`);
  }
  if (hasTowns(goods.towns)) parts.push(townsLabel(goods.towns, townName));
  return parts.join(" and ");
};

/** "pays" for coin and supply; "offers" when the side hands back only towns ("you offer the return of ..."). */
const payVerb = (goods: DiplomacyGoods, person: "you" | "they" = "they"): string => {
  const onlyTowns = hasTowns(goods.towns) && goods.gold === 0 && !goods.coinPerHour && !hasResourceSupplyOffer(goods.resources);
  if (onlyTowns) return person === "you" ? "offer" : "offers";
  return person === "you" ? "pay" : "pays";
};

/** "Beejac pays 50 coin; you pay 20 coin" -- from the recipient's point of view. */
export const describeDiplomacyTermsForRecipient = (terms: DiplomacyTerms | undefined, proposerName: string, townName?: TownNameLookup): string => {
  if (diplomacyTermsAreEmpty(terms) || !terms) return "";
  const parts: string[] = [];
  const lumpSum = hasContinuingTerms(terms);
  const theyPay = goodsLabel(terms.give, lumpSum, townName);
  const youPay = goodsLabel(terms.ask, lumpSum, townName);
  if (theyPay) parts.push(`${proposerName} ${payVerb(terms.give)} ${theyPay}`);
  if (youPay) parts.push(`you ${payVerb(terms.ask, "you")} ${youPay}`);
  const text = parts.join("; ");
  return hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources)
    ? `${text}. Supply lasts ${RESOURCE_SUPPLY_TRADE_DAYS} days from acceptance.` : text;
};

/** "you pay 50 coin; Milo pays 20 coin" -- from the proposer's point of view. */
export const describeDiplomacyTermsForProposer = (terms: DiplomacyTerms | undefined, targetName: string, townName?: TownNameLookup): string => {
  if (diplomacyTermsAreEmpty(terms) || !terms) return "";
  const parts: string[] = [];
  const lumpSum = hasContinuingTerms(terms);
  const youPay = goodsLabel(terms.give, lumpSum, townName);
  const theyPay = goodsLabel(terms.ask, lumpSum, townName);
  if (youPay) parts.push(`you ${payVerb(terms.give, "you")} ${youPay}`);
  if (theyPay) parts.push(`${targetName} ${payVerb(terms.ask)} ${theyPay}`);
  const text = parts.join("; ");
  return hasResourceSupplyOffer(terms.give.resources) || hasResourceSupplyOffer(terms.ask.resources)
    ? `${text}. Supply lasts ${RESOURCE_SUPPLY_TRADE_DAYS} days from acceptance.` : text;
};

// --- AI pricing -----------------------------------------------------------

/**
 * Everything the client needs to preview an AI's answer locally. `required*`
 * is the net coin-equivalent the AI must receive for that offer; negative
 * means it would pay up to that much itself; null means it refuses outright.
 */
export type AiDiplomacyPricing = {
  required: { truce12: number | null; truce24: number | null; alliance: number | null };
  aiHoldings: DiplomacyGoods;
  /**
   * The requester's earned Coin per hour not already pledged elsewhere. Pledges
   * share income proportionally, so an AI counts Coin per hour only up to this;
   * absent (unread), it counts none.
   */
  requesterSpareCoinPerHour?: number;
  /** The AI's own earned Coin per hour not already pledged: the most it would pledge the requester. Absent, it pledges none. */
  aiSpareCoinPerHour?: number;
  /** Towns the AI took from the requester recently and could hand back, with the coin the AI counts giving each up for. */
  aiTownValues?: PricedTown[];
  /** Towns the requester took from the AI recently and could hand back, with the coin the AI counts each for. */
  townValues?: PricedTown[];
  /**
   * The truce price when the deal hands back at least one of `townValues`:
   * set when the AI otherwise refuses a truce because it can still retake its
   * land (a returned town is reparations that buys peace anyway).
   */
  townReturn?: { truce12: number | null; truce24: number | null };
};

/** Returning one of the AI's lost towns lifts a "can still retake" refusal to this price. */
const townReturnPrice = (pricing: AiDiplomacyPricing, kind: DiplomacyOfferKind, durationHours: 12 | 24, terms?: DiplomacyTerms): number | null => {
  if (kind !== "truce" || !pricing.townReturn || !terms || !returnsPricedTown(pricing.townValues, terms.give.towns)) return null;
  return durationHours === 24 ? pricing.townReturn.truce24 : pricing.townReturn.truce12;
};

// An AI never pays to join an alliance: its alliance price is never negative.
export const requiredForOffer = (pricing: AiDiplomacyPricing, kind: DiplomacyOfferKind, durationHours: 12 | 24, terms?: DiplomacyTerms): number | null => {
  if (kind === "alliance") return pricing.required.alliance === null ? null : Math.max(0, pricing.required.alliance);
  const base = durationHours === 24 ? pricing.required.truce24 : pricing.required.truce12;
  return base ?? townReturnPrice(pricing, kind, durationHours, terms);
};

/** True when the AI refuses this truce outright but would sell it for one of its towns back. */
export const truceNeedsTownReturn = (pricing: AiDiplomacyPricing, durationHours: 12 | 24): boolean =>
  (durationHours === 24 ? pricing.required.truce24 : pricing.required.truce12) === null &&
  (durationHours === 24 ? pricing.townReturn?.truce24 : pricing.townReturn?.truce12) != null &&
  Boolean(pricing.townValues && pricing.townValues.length > 0);

const asksAnything = (terms: DiplomacyTerms): boolean =>
  terms.ask.gold > 0 || hasResourceSupplyOffer(terms.ask.resources) || Boolean(terms.ask.coinPerHour) || hasTowns(terms.ask.towns);

/**
 * What an AI counts Coin per hour for, against the same Coin paid upfront:
 * payments can pause or shrink with the payer's income, so it is worth less.
 */
export const AI_RECURRING_COIN_VALUE_SHARE = 0.5;

/**
 * Net coin-equivalent flowing to the AI target under these terms.
 * `coinHours`: how long any Coin per hour is paid for (0 ignores it). The
 * AI's own pledge costs it the full amount: discounted like the requester's,
 * a player could buy a pledge for less than it pays out.
 */
export const netValueToAi = (terms: DiplomacyTerms, coinHours = 0): number =>
  terms.give.gold - terms.ask.gold +
  resourceSupplyCoinValue(terms.give.resources, 24) - resourceSupplyCoinValue(terms.ask.resources, 24) +
  ((terms.give.coinPerHour ?? 0) * AI_RECURRING_COIN_VALUE_SHARE - (terms.ask.coinPerHour ?? 0)) * coinHours;

/** An AI pledges or takes Coin per hour only in a truce. */
const aiTakesRecurringCoin = (kind: DiplomacyOfferKind, terms: DiplomacyTerms): boolean =>
  kind === "truce" || !hasRecurringCoin(terms);

/** The terms as an AI values them: the requester's Coin per hour capped at their spare income. */
const pledgeAsCounted = (pricing: AiDiplomacyPricing, terms: DiplomacyTerms): DiplomacyTerms => {
  if (!terms.give.coinPerHour) return terms;
  const counted = Math.min(terms.give.coinPerHour, Math.max(0, Math.floor(pricing.requesterSpareCoinPerHour ?? 0)));
  return { ...terms, give: { ...terms.give, coinPerHour: counted } };
};

/** Hours the AI values the requester's Coin per hour over (see recurringCoinTermHours). */
export const aiCoinHours = (kind: DiplomacyOfferKind, durationHours: 12 | 24, terms: DiplomacyTerms): number =>
  recurringCoinTermHours(kind, durationHours, terms) ?? 0;

/** What the AI counts the terms for: netValueToAi plus its own towns handed back, less the requester's towns it hands back. */
export const aiValueOfTerms = (pricing: AiDiplomacyPricing, kind: DiplomacyOfferKind, durationHours: 12 | 24, terms: DiplomacyTerms): number =>
  netValueToAi(pledgeAsCounted(pricing, terms), aiCoinHours(kind, durationHours, terms)) +
  townsValueToAi(pricing.townValues, terms.give.towns) - townsValueToAi(pricing.aiTownValues, terms.ask.towns);
const valueToAi = aiValueOfTerms;

/** Towns change hands only in a truce. */
const townTermsRefused = (kind: DiplomacyOfferKind, terms: DiplomacyTerms): boolean =>
  kind !== "truce" && (hasTowns(terms.ask.towns) || hasTowns(terms.give.towns));

/** Asked-for towns the AI can't hand back: ones it didn't take from the requester lately. */
const unreturnableTowns = (pricing: AiDiplomacyPricing, towns: readonly DiplomacyTownRef[] | undefined): DiplomacyTownRef[] => {
  const priced = new Set((pricing.aiTownValues ?? []).map(townRefKey));
  return (towns ?? []).filter((town) => !priced.has(townRefKey(town)));
};

export type AiOfferVerdict =
  | { accepts: true }
  | { accepts: false; reason: "refuses" }
  /** Alliances: the AI gives nothing, so any ask is refused outright. */
  | { accepts: false; reason: "aiWontPay" }
  | { accepts: false; reason: "aiCannotPay"; missing: DiplomacyGoods }
  | { accepts: false; reason: "shortfall"; shortfall: number };

export const evaluateAiOffer = (
  pricing: AiDiplomacyPricing,
  kind: DiplomacyOfferKind,
  durationHours: 12 | 24,
  terms: DiplomacyTerms
): AiOfferVerdict => {
  const required = requiredForOffer(pricing, kind, durationHours, terms);
  if (required === null || !aiTakesRecurringCoin(kind, terms) || townTermsRefused(kind, terms)) return { accepts: false, reason: "refuses" };
  if (kind === "alliance" && asksAnything(terms)) return { accepts: false, reason: "aiWontPay" };
  const missing: DiplomacyGoods = {
    gold: Math.max(0, terms.ask.gold - pricing.aiHoldings.gold)
  };
  const missingSupply = missingResourceSupply(terms.ask.resources, pricing.aiHoldings.resources);
  if (hasResourceSupplyOffer(missingSupply)) missing.resources = missingSupply;
  const missingPledge = Math.max(0, (terms.ask.coinPerHour ?? 0) - Math.floor(pricing.aiSpareCoinPerHour ?? 0));
  if (missingPledge > 0) missing.coinPerHour = missingPledge;
  const missingTowns = unreturnableTowns(pricing, terms.ask.towns);
  if (missingTowns.length > 0) missing.towns = missingTowns;
  if (missing.gold > 0 || hasResourceSupplyOffer(missingSupply) || missingPledge > 0 || missingTowns.length > 0) return { accepts: false, reason: "aiCannotPay", missing };
  const shortfall = required - valueToAi(pricing, kind, durationHours, terms);
  return shortfall > 0 ? { accepts: false, reason: "shortfall", shortfall: Math.ceil(shortfall) } : { accepts: true };
};

export type AiCounterOffer =
  | { kind: "counter"; terms: DiplomacyTerms }
  | { kind: "cannotAfford"; shortfall: number }
  | { kind: "refuses" };

/**
 * The smallest change to the requester's terms that the AI would accept,
 * never asking for more than the requester actually holds: first drop what
 * the requester asked the AI for, then ask for the requester's coin, then
 * their resource supply, then (truces only) Coin per hour from their spare income,
 * then (truces only) one of its own towns back. A truce the AI refuses while it
 * can still retake its land (pricing.townReturn) asks for a town first. If even
 * everything they have isn't enough, the AI says so instead of naming a price
 * they can't pay.
 */
export const aiCounterOffer = (
  pricing: AiDiplomacyPricing,
  kind: DiplomacyOfferKind,
  durationHours: 12 | 24,
  terms: DiplomacyTerms,
  requesterHoldings: DiplomacyGoods
): AiCounterOffer => {
  const mustReturnTown = kind === "truce" && truceNeedsTownReturn(pricing, durationHours);
  const required = mustReturnTown ? (durationHours === 24 ? pricing.townReturn!.truce24 : pricing.townReturn!.truce12) : requiredForOffer(pricing, kind, durationHours);
  if (required === null || required === undefined || !aiTakesRecurringCoin(kind, terms) || (kind !== "truce" && hasTowns(terms.give.towns))) return { kind: "refuses" };
  const next: DiplomacyTerms = {
    give: copyGoods(terms.give),
    // Never counter by asking the AI to pay more than it holds, nor anything at all for an alliance.
    ask:
      kind === "alliance"
        ? { gold: 0 }
        : { gold: Math.min(terms.ask.gold, pricing.aiHoldings.gold) }
  };
  if (terms.supplyDurationHours) next.supplyDurationHours = terms.supplyDurationHours;
  if (kind !== "alliance") {
    const resources = clampedResourceSupply(terms.ask.resources, pricing.aiHoldings.resources);
    if (hasResourceSupplyOffer(resources)) next.ask.resources = resources;
  }
  if (kind === "truce") {
    const pledge = Math.min(terms.ask.coinPerHour ?? 0, Math.max(0, Math.floor(pricing.aiSpareCoinPerHour ?? 0)));
    if (pledge > 0) next.ask.coinPerHour = pledge;
    const unreturnable = new Set(unreturnableTowns(pricing, terms.ask.towns).map(townRefKey));
    const towns = (terms.ask.towns ?? []).filter((town) => !unreturnable.has(townRefKey(town))).map(({ x, y }) => ({ x, y }));
    if (towns.length > 0) next.ask.towns = towns;
  }
  // A town buys the peace this AI otherwise refuses: name one first, then fill any gap.
  if (mustReturnTown && !returnsPricedTown(pricing.townValues, next.give.towns)) {
    const before = valueToAi(pricing, kind, durationHours, next);
    addTowns(next, townsToCover(pricing.townValues ?? [], next.give.towns ?? [], required - before, true));
  }
  let deficit = required - valueToAi(pricing, kind, durationHours, next);
  if (deficit <= 0) return { kind: "counter", terms: next };

  const dropAskGold = Math.min(next.ask.gold, Math.ceil(deficit));
  next.ask.gold -= dropAskGold;
  deficit -= dropAskGold;
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    if (deficit <= 0) break;
    const unitValue = RESOURCE_SUPPLY_COIN_VALUE_PER_DAY[resource] * (24) / 24;
    const drop = Math.min(next.ask.resources?.[resource] ?? 0, Math.ceil(deficit / unitValue));
    if (drop > 0 && next.ask.resources) { next.ask.resources[resource] = (next.ask.resources[resource] ?? 0) - drop; deficit -= drop * unitValue; }
  }
  deficit = dropAskedPledgeAndTowns(pricing, kind, durationHours, next, deficit);
  if (deficit > 0) {
    const addGold = Math.min(Math.max(0, requesterHoldings.gold - next.give.gold), Math.ceil(deficit));
    next.give.gold += addGold;
    deficit -= addGold;
  }
  for (const resource of TRADABLE_SUPPLY_RESOURCES) {
    if (deficit <= 0) break;
    const unitValue = RESOURCE_SUPPLY_COIN_VALUE_PER_DAY[resource] * (24) / 24;
    const available = Math.max(0, (requesterHoldings.resources?.[resource] ?? 0) - (next.give.resources?.[resource] ?? 0));
    const add = Math.min(available, Math.ceil(deficit / unitValue));
    if (add > 0) { next.give.resources ??= {}; next.give.resources[resource] = (next.give.resources[resource] ?? 0) + add; deficit -= add * unitValue; }
  }
  // Still short after coin and supply: a truce can take Coin per hour from the
  // requester's spare income, like Civ's gold per turn, so a small empire can
  // still buy peace it couldn't pay for upfront.
  if (deficit > 0 && kind === "truce") {
    const hours = aiCoinHours(kind, durationHours, next);
    const perCoinPerHour = hours * AI_RECURRING_COIN_VALUE_SHARE;
    const spare = Math.max(0, Math.floor(pricing.requesterSpareCoinPerHour ?? 0) - (next.give.coinPerHour ?? 0));
    const add = perCoinPerHour > 0 ? Math.min(spare, Math.ceil(deficit / perCoinPerHour)) : 0;
    if (add > 0) {
      next.give.coinPerHour = (next.give.coinPerHour ?? 0) + add;
      deficit -= add * perCoinPerHour;
    }
  }
  // Still short: a truce can take back one of the AI's own towns (reparations in kind).
  if (deficit > 0 && kind === "truce" && pricing.townValues) {
    const towns = townsToCover(pricing.townValues, next.give.towns ?? [], deficit, false);
    addTowns(next, towns);
    deficit -= towns.reduce((sum, town) => sum + town.value, 0);
  }
  if (deficit > 0) return { kind: "cannotAfford", shortfall: Math.ceil(deficit) };
  return { kind: "counter", terms: next };
};

/** Takes the AI's own Coin per hour, then its towns, out of what was asked of it until `deficit` is covered. */
const dropAskedPledgeAndTowns = (pricing: AiDiplomacyPricing, kind: DiplomacyOfferKind, durationHours: 12 | 24, terms: DiplomacyTerms, deficit: number): number => {
  const hours = aiCoinHours(kind, durationHours, terms);
  if (deficit > 0 && terms.ask.coinPerHour && hours > 0) {
    const drop = Math.min(terms.ask.coinPerHour, Math.ceil(deficit / hours));
    const left = terms.ask.coinPerHour - drop;
    if (left > 0) terms.ask.coinPerHour = left;
    else delete terms.ask.coinPerHour;
    deficit -= drop * hours;
  }
  const values = new Map((pricing.aiTownValues ?? []).map((town) => [townRefKey(town), town.value]));
  while (deficit > 0 && terms.ask.towns && terms.ask.towns.length > 0) {
    const towns = [...terms.ask.towns].sort((a, b) => (values.get(townRefKey(a)) ?? 0) - (values.get(townRefKey(b)) ?? 0));
    const town = towns.find((entry) => (values.get(townRefKey(entry)) ?? 0) >= deficit) ?? towns[towns.length - 1]!;
    const kept = terms.ask.towns.filter((entry) => townRefKey(entry) !== townRefKey(town));
    if (kept.length > 0) terms.ask.towns = kept;
    else delete terms.ask.towns;
    deficit -= values.get(townRefKey(town)) ?? 0;
  }
  return deficit;
};

const addTowns = (terms: DiplomacyTerms, towns: readonly PricedTown[]): void => {
  if (towns.length === 0) return;
  terms.give.towns = [...(terms.give.towns ?? []), ...towns.map(({ x, y }) => ({ x, y }))];
};
