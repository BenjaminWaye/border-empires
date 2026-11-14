import type { ClientState } from "../client-state/client-state.js";
import { isMapLoadingOverlayActive } from "../client-map-loading-view/client-map-loading-view.js";
import { createPopupBlockedCheck, type PopupGateState } from "../client-map-unobstructed/client-popup-gate.js";

// When the incoming-offer dock must wait. Playtesters back from an overnight
// war saw "Rowan offers a 12h truce" over the loading screen, before any word
// of the attack, and accepted it blind. The dock now waits for the map
// (loading overlay and staged map build) and for the return briefing: while
// the personal timeline that may auto-open the Chronicle is still on its way
// (bounded by the popup gate's grace), and while the Chronicle or any other
// auto-opening dialog covers the map. Offers are never dropped, only held.

export type OfferDockHoldState = PopupGateState &
  Pick<ClientState, "mapPrep" | "authError" | "connection" | "firstChunkAt" | "hasEverInitialized" | "disconnectedSince" | "seasonPending">;

export const createOfferDockHold = (): ((state: OfferDockHoldState, nowMs?: number) => boolean) => {
  const gate = createPopupBlockedCheck();
  return (state, nowMs = Date.now()) =>
    isMapLoadingOverlayActive(state, nowMs) || (Boolean(state.mapPrep) && !state.authError) || gate.isBlocked(state, nowMs);
};
