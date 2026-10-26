import type { ClientState } from "../client-state/client-state.js";
import { applyResourceTradeState } from "./client-resource-trade-state.js";
/** Apply the same resource state on updates as on initial connection. */
export function applyPlayerResourceState(state: ClientState, payload: Record<string, unknown>): void {
  applyResourceTradeState(state, payload);
  state.resourceSlots = (payload.resourceSlots as typeof state.resourceSlots | undefined) ?? state.resourceSlots;
  state.dormantStructures = (payload.dormantStructures as typeof state.dormantStructures | undefined) ?? state.dormantStructures;
  if (payload.storageCap && typeof payload.storageCap === "object") state.storageCap = payload.storageCap as typeof state.storageCap;
}
