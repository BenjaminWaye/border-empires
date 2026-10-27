// DIPLOMACY_GIFT: the trade screen gives an AI coin/Shards for nothing but
// its goodwill. The simulation moves the goods (the same settlement a deal's
// terms use); once paid, the AI remembers it as a payment, which raises its
// opinion of the payer (capped and fading, see diplomacy-gift.ts in
// @border-empires/shared). Only AIs keep opinions, so only AIs take gifts.
import { netValueToAi, SHARD_COIN_VALUE, type DiplomacyGoods } from "@border-empires/shared";

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
  isAi: (playerId: string) => boolean;
  settle: DiplomacySettlement["settle"];
  /** Remembers coin-equivalent paid to the AI as goodwill. */
  recordPayment: (aiPlayerId: string, playerId: string, coinToAi: number) => void;
  recordGatewayEvent: (level: "info" | "warn" | "error", event: string, payload?: Record<string, unknown>) => void;
};

const goodsLabel = (goods: DiplomacyGoods): string =>
  [goods.gold > 0 ? `${goods.gold} coin` : "", goods.shard > 0 ? `${goods.shard} ${goods.shard === 1 ? "Shard" : "Shards"}` : ""].filter(Boolean).join(" and ");

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
  if (!deps.isAi(target.id)) return fail(`${target.name} keeps no opinion of you to win over. Only AI empires take gifts.`);
  const gift = { gold: Math.max(0, Math.floor(message.gift.gold)), shard: Math.max(0, Math.floor(message.gift.shard)) };
  if (gift.gold === 0 && gift.shard === 0) return fail("Choose how much coin or how many Shards to give.");
  const paid = await deps.settle({ proposerId: payerId, targetId: target.id, terms: { give: gift, ask: { gold: 0, shard: 0 } } });
  if (!paid.ok) return fail(paid.message);
  const value = netValueToAi({ give: gift, ask: { gold: 0, shard: 0 } }, SHARD_COIN_VALUE);
  deps.recordPayment(target.id, payerId, value);
  deps.recordGatewayEvent("info", "gateway_diplomacy_gift_paid", { payerId, targetId: target.id, gold: gift.gold, shard: gift.shard });
  return {
    type: "DIPLOMACY_GIFT_RESULT",
    ok: true,
    targetPlayerName: target.name,
    targetPlayerId: target.id,
    message: `You gave ${target.name} ${goodsLabel(gift)} as a gift.`
  };
};
