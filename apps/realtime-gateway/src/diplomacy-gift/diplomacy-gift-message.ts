// DIPLOMACY_GIFT: the trade screen gives an AI coin, or towns taken from
// it (the "return a town" term), for nothing but its goodwill. The simulation moves the goods (the same settlement a deal's
// terms use); once paid, the AI remembers it as a payment, which raises its
// opinion of the payer (capped and fading, see diplomacy-gift.ts in
// @border-empires/shared). Only AIs keep opinions, so only AIs take gifts.
import { hasTowns, netValueToAi, townsLabel, type DiplomacyGoods, type DiplomacyTownRef } from "@border-empires/shared";

import type { DiplomacySettlement } from "../diplomacy-settlement/diplomacy-settlement.js";

export type DiplomacyGiftMessage = { targetPlayerName: string; targetPlayerId?: string | undefined; gift: DiplomacyGoods };

export type DiplomacyGiftResultPayload = {
  type: "DIPLOMACY_GIFT_RESULT";
  ok: boolean;
  targetPlayerName: string;
  targetPlayerId?: string;
  message: string;
};

export type DiplomacyGiftDeps = {
  resolvePlayerByName: (playerName: string) => { id: string; name: string } | undefined;
  resolvePlayerById: (playerId: string) => { id: string; name: string } | undefined;
  /** An AI nobody is playing right now: only those keep opinions (a seeded AI with a live socket is a person). */
  isAutoRespondingAi: (playerId: string) => boolean;
  settle: DiplomacySettlement["settle"];
  /** Remembers coin-equivalent paid to the AI as goodwill. */
  recordPayment: (aiPlayerId: string, playerId: string, coinToAi: number) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
  /**
   * Payers with a gift still settling: one at a time each, so a script can't
   * fill the shared settlement queue that every deal's accept waits on.
   * Bounded by connected players; each entry is removed when its gift settles.
   */
  giftsInFlight: Set<string>;
  /** Goodwill coin for towns handed back (town-gift-value.ts); absent, town gifts are refused. */
  townGiftValue?: (payerId: string, aiId: string, towns: readonly DiplomacyTownRef[]) => Promise<number>;
};

const goodsLabel = (goods: DiplomacyGoods): string =>
  [goods.gold > 0 ? `${goods.gold} coin` : "", hasTowns(goods.towns) ? townsLabel(goods.towns) : ""].filter(Boolean).join(" and ");

export const offerDiplomacyGift = async (
  deps: DiplomacyGiftDeps,
  payerId: string,
  message: DiplomacyGiftMessage,
  session: { isGuest: boolean }
): Promise<DiplomacyGiftResultPayload> => {
  const target = (message.targetPlayerId ? deps.resolvePlayerById(message.targetPlayerId) : undefined) ?? deps.resolvePlayerByName(message.targetPlayerName);
  const fail = (text: string): DiplomacyGiftResultPayload => ({
    type: "DIPLOMACY_GIFT_RESULT",
    ok: false,
    targetPlayerName: target?.name ?? message.targetPlayerName,
    ...(target ? { targetPlayerId: target.id } : {}),
    message: text
  });
  if (session.isGuest) return fail("Save your empire to a real account to offer gifts.");
  if (!target || target.id === payerId) return fail(`No empire named ${message.targetPlayerName}.`);
  if (!deps.isAutoRespondingAi(target.id)) return fail(`${target.name} keeps no opinion of you to win over. Only AI empires take gifts.`);
  const towns = message.gift.towns ?? [];
  if (towns.length > 0 && !deps.townGiftValue) return fail("Towns can't be given right now.");
  const gift: DiplomacyGoods = { gold: Math.max(0, Math.floor(message.gift.gold)), ...(towns.length > 0 ? { towns } : {}) };
  if (gift.gold === 0 && towns.length === 0) return fail("Choose how much coin to give.");
  if (deps.giftsInFlight.has(payerId)) return fail("Your last gift is still being delivered.");
  deps.giftsInFlight.add(payerId);
  let townValue = 0;
  let paid: Awaited<ReturnType<DiplomacyGiftDeps["settle"]>>;
  try {
    // Valued before it moves: once settled, the town is no longer the payer's to return.
    townValue = towns.length > 0 && deps.townGiftValue ? await deps.townGiftValue(payerId, target.id, towns).catch(() => 0) : 0;
    paid = await deps.settle({ proposerId: payerId, targetId: target.id, terms: { give: gift, ask: { gold: 0 } } });
  } finally {
    deps.giftsInFlight.delete(payerId);
  }
  if (!paid.ok) return fail(paid.message);
  const value = netValueToAi({ give: { gold: gift.gold }, ask: { gold: 0 } }) + townValue;
  deps.recordPayment(target.id, payerId, value);
  deps.recordGatewayEvent("info", "gateway_diplomacy_gift_paid", { payerId, targetId: target.id, gold: gift.gold, towns: towns.length });
  return {
    type: "DIPLOMACY_GIFT_RESULT",
    ok: true,
    targetPlayerName: target.name,
    targetPlayerId: target.id,
    message: `You gave ${target.name} ${goodsLabel(gift)} as a gift.`
  };
};
