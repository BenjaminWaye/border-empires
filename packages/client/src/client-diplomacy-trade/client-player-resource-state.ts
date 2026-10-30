import type { ClientState } from "../client-state/client-state.js";
import { applyResourceTradeState } from "./client-resource-trade-state.js";
/** Apply the same resource state on updates as on initial connection. */
export function applyPlayerResourceState(state: ClientState, payload: Record<string, unknown>): void {
  applyResourceTradeState(state, payload);
  state.resourceSlots = (payload.resourceSlots as typeof state.resourceSlots | undefined) ?? state.resourceSlots;
  state.dormantStructures = (payload.dormantStructures as typeof state.dormantStructures | undefined) ?? state.dormantStructures;
  if (payload.storageCap && typeof payload.storageCap === "object") state.storageCap = payload.storageCap as typeof state.storageCap;
}

export function applyResourceTradeMessage(state: Parameters<typeof applyResourceTradeState>[0], payload: Record<string, unknown>): boolean {
  if (payload.type !== "RESOURCE_TRADE_UPDATE") return false;
  applyResourceTradeState(state, {resourceTradeOffers:payload.offers});return true;
}
