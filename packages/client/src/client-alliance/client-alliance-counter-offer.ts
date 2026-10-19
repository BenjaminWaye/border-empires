// "Counter" on an incoming truce/alliance card: opens the trade screen with
// the offer already filled in from the player's side (their coin becomes
// "You ask", what they asked for becomes "You give"), so a reply like "only if
// you pay 24 coin" is one edit away. Sending replaces their offer with yours --
// the gateway rejects the countered offer in the same step
// (apps/realtime-gateway diplomacy-counter-offer.ts).
import { swapDiplomacyTerms, type DiplomacyCounterRef, type DiplomacyOfferKind, type DiplomacyTerms } from "@border-empires/shared";

import type { AllianceRequest, TruceRequest } from "../client-types.js";
import { diplomacyTradeDepsFor, openDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";

export type CounterOfferDeps = {
  playerNameForOwner: (ownerId?: string | null) => string | undefined;
  sendGameMessage: (payload: unknown, message?: string) => boolean;
  state: {
    gold: number;
    strategicResources: { SHARD?: number };
    incomingTruceRequests: readonly TruceRequest[];
    incomingAllianceRequests: readonly AllianceRequest[];
  };
};

export type CounterOfferScreenInput = {
  targetName: string;
  kind: DiplomacyOfferKind;
  durationHours: 12 | 24;
  terms?: DiplomacyTerms;
  counters: DiplomacyCounterRef;
};

/** The trade screen's starting point for countering this offer; undefined once it's gone. */
export const counterOfferScreenInput = (
  kind: DiplomacyOfferKind,
  requestId: string,
  deps: Pick<CounterOfferDeps, "playerNameForOwner" | "state">
): CounterOfferScreenInput | undefined => {
  const truce = kind === "truce" ? deps.state.incomingTruceRequests.find((entry) => entry.id === requestId) : undefined;
  const request = kind === "truce" ? truce : deps.state.incomingAllianceRequests.find((entry) => entry.id === requestId);
  if (!request) return undefined;
  const targetName = deps.playerNameForOwner(request.fromPlayerId) ?? request.fromName;
  if (!targetName) return undefined;
  return {
    targetName,
    kind,
    durationHours: truce?.durationHours ?? 12,
    ...(request.terms ? { terms: swapDiplomacyTerms(request.terms) } : {}),
    counters: { kind, requestId }
  };
};

export const bindCounterOfferButtons = (root: ParentNode, deps: CounterOfferDeps): void => {
  root.querySelectorAll<HTMLButtonElement>(".counter-offer").forEach((btn) => {
    btn.onclick = () => {
      const kind = btn.dataset.counterKind === "alliance" ? "alliance" : "truce";
      const input = counterOfferScreenInput(kind, btn.dataset.counterRequestId ?? "", deps);
      if (!input) return;
      openDiplomacyTradeScreen(input, diplomacyTradeDepsFor(deps.state, deps.sendGameMessage));
    };
  });
};
