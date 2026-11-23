// What the diplomacy trade screen needs from the client, and the treaty
// buttons it shows. Split out of client-diplomacy-trade.ts (line cap).
import type { DiplomacyGoods, ResourceSupplyAgreementStatus, ResourceSupplyOffer, ResourceTradeOffer } from "@border-empires/shared";
import type { ChronicleWarCounts } from "./client-diplomacy-trade-view.js";

export type DiplomacyTradeDeps = {
  /** Sends a client message; false when not signed in yet. */
  send: (payload: unknown, notSignedInMessage: string) => boolean;
  ownHoldings: () => DiplomacyGoods;
  /** When your current truce with this empire began and ends, if you have one: a truce offer then extends it. */
  runningTruce?: (targetPlayerId: string | undefined, targetName: string) => { startedAt: number; endsAt: number } | undefined;
  /** True when you are already allied with this empire: the screen then offers goods only, no truce or alliance. */
  isAlly?: (targetPlayerId: string | undefined) => boolean;
  activeSupply?: () => { ownId: string; agreements: readonly ResourceSupplyAgreementStatus[]; offers?: readonly ResourceTradeOffer[] };
  /** This empire's row in your last-fetched Chronicle, so the war tally shows the Chronicle's own tile counts. */
  chronicleRival?: (targetPlayerId: string) => ChronicleWarCounts | undefined;
};

type TradeDepsState = {
  resourceTradeOffers?: readonly ResourceTradeOffer[];
  me?: string;
  resourceTradeAgreements?: readonly ResourceSupplyAgreementStatus[];
  gold: number;
  resourceTradeHoldings?: ResourceSupplyOffer | undefined;
  activeTruces?: ReadonlyArray<{ otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number }>;
  allies?: readonly string[];
  activityDashboard?: { timeline?: { rivals?: ReadonlyArray<ChronicleWarCounts & { playerId: string }> } | undefined };
};

/**
 * Trade-screen deps from the client's own state: every truce/alliance entry
 * point (tile menu, Diplomacy screen) opens the screen with these, so none of
 * them sends an offer without terms and the AI's verdict.
 */
export const diplomacyTradeDepsFor = (state: TradeDepsState, send: DiplomacyTradeDeps["send"]): DiplomacyTradeDeps => ({
  send,
  chronicleRival: (targetPlayerId) => state.activityDashboard?.timeline?.rivals?.find((rival) => rival.playerId === targetPlayerId),
  runningTruce: (targetPlayerId, targetName) =>
    state.activeTruces?.find((t) => (targetPlayerId ? t.otherPlayerId === targetPlayerId : t.otherPlayerName.toLocaleLowerCase() === targetName.toLocaleLowerCase())),
  isAlly: (targetPlayerId) => targetPlayerId !== undefined && (state.allies ?? []).includes(targetPlayerId),
  activeSupply: () => ({ ownId: state.me ?? "", agreements: state.resourceTradeAgreements ?? [], offers: state.resourceTradeOffers ?? [] }),
  ownHoldings: () => ({
    ...(state.resourceTradeHoldings ? { resources: state.resourceTradeHoldings } : {}),
    gold: Math.max(0, Math.floor(state.gold))
  })
});

/**
 * The Truce / Alliance buttons on the deal's left. An ally gets a note
 * instead: playtest 2026-11-13 (pt-diplomat) found an ally's screen still
 * offering both and pricing an alliance that already existed.
 */
export const treatyButtonsHtml = (input: { allied: boolean; inTruce: boolean; fits: (hours: 12 | 24) => boolean; capTitle: string }): string => {
  if (input.allied) return `<p class="diplomacy-trade-allied-note" data-trade-allied>Already allied. Trade goods below.</p>`;
  const truceButton = (hours: 12 | 24): string =>
    input.inTruce
      ? `<button type="button" data-trade-kind="truce:${hours}"${input.fits(hours) ? "" : ` disabled title="${input.capTitle}"`}>Extend ${hours}h</button>`
      : `<button type="button" data-trade-kind="truce:${hours}">Truce ${hours}h</button>`;
  return `${truceButton(12)}${truceButton(24)}
          <button type="button" data-trade-kind="alliance:0">Alliance</button>`;
};
