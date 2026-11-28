import type { ClientState } from "../client-state/client-state.js";
import { applyResourceTradeState } from "./client-resource-trade-state.js";
import { showDealMarker, type DealAnchorState } from "../client-action-markers/client-deal-marker.js";
/** Apply the same resource state on updates as on initial connection. */
export function applyPlayerResourceState(state: ClientState, payload: Record<string, unknown>): void {
  applyResourceTradeState(state, payload);
  state.resourceSlots = (payload.resourceSlots as typeof state.resourceSlots | undefined) ?? state.resourceSlots;
  state.dormantStructures = (payload.dormantStructures as typeof state.dormantStructures | undefined) ?? state.dormantStructures;
  if (payload.storageCap && typeof payload.storageCap === "object") state.storageCap = payload.storageCap as typeof state.storageCap;
}

/** "Tove accepted your trade" for the proposer, "Trade with Milo agreed" for the House that accepted. */
export const resourceTradeAcceptedText = (me: string | undefined, payload: Record<string, unknown>): string | undefined => {
  const { fromPlayerId, fromPlayerName, toPlayerName } = payload;
  if (typeof fromPlayerName !== "string" || typeof toPlayerName !== "string") return undefined;
  return fromPlayerId === me ? `${toPlayerName} accepted your trade` : `Trade with ${fromPlayerName} agreed`;
};

/** The other House in an accepted trade. */
const tradeCounterpart = (me: string | undefined, payload: Record<string, unknown>): string | undefined => {
  const other = payload.fromPlayerId === me ? payload.toPlayerId : payload.fromPlayerId;
  return typeof other === "string" ? other : undefined;
};

type TradeFeed = (message: string, type: "alliance", severity: "success") => void;

export function applyResourceTradeMessage(
  state: Parameters<typeof applyResourceTradeState>[0] & { me?: string } & DealAnchorState,
  payload: Record<string, unknown>,
  pushFeed?: TradeFeed
): boolean {
  // Sent by the gateway only after the simulation paid the deal (resource-trade-service.ts). The feed says
  // who; the map marks it on the other House's land when any of it is known (client-deal-marker.ts).
  if (payload.type === "RESOURCE_TRADE_ACCEPTED") {
    const text = resourceTradeAcceptedText(state.me, payload);
    if (!text) return true;
    pushFeed?.(text, "alliance", "success");
    showDealMarker(state, tradeCounterpart(state.me, payload), "Trade agreed");
    return true;
  }
  if (payload.type !== "RESOURCE_TRADE_UPDATE") return false;
  applyResourceTradeState(state, {resourceTradeOffers:payload.offers});return true;
}
