// The "You have 12" / "3 spare" line under each good on the deal screen.
import type { DiplomacyGoods } from "@border-empires/shared";
import type { TradeGoodSpec } from "./client-diplomacy-trade-goods.js";

export const haveText = (own: DiplomacyGoods, theirs: DiplomacyGoods | undefined, spec: TradeGoodSpec): string => {
  if (spec.good === "coinPerHour") return "From future income";
  const holdings = spec.side === "give" ? own : theirs;
  if (!holdings || (spec.supply && !holdings.resources)) return "";
  const amount = spec.good === "gold" ? holdings.gold : (holdings.resources?.[spec.good] ?? 0);
  return spec.supply ? `${amount} spare` : `${spec.side === "give" ? "You have" : "Has"} ${amount}`;
};
