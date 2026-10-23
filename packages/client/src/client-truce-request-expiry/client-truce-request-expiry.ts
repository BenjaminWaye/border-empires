import type { ClientState } from "../client-state/client-state.js";

type TruceRequestState = Pick<ClientState, "incomingTruceRequests" | "outgoingTruceRequests">;

/**
 * Truce offers expire after TRUCE_REQUEST_TTL_MS (5 min). The gateway prunes
 * expired offers silently (social-state.ts sweepExpired) and sends no
 * TRUCE_UPDATE, so without this the client kept showing a dead offer in the
 * Alliances panel and the ally badge, and Accept failed with
 * TRUCE_REQUEST_INVALID ("request invalid or expired").
 *
 * Returns true when anything was dropped, so the caller knows to re-render.
 */
export const dropExpiredTruceRequests = (state: TruceRequestState, nowMs: number): boolean => {
  const incoming = state.incomingTruceRequests.filter((request) => request.expiresAt > nowMs);
  const outgoing = state.outgoingTruceRequests.filter((request) => request.expiresAt > nowMs);
  const changed = incoming.length !== state.incomingTruceRequests.length || outgoing.length !== state.outgoingTruceRequests.length;
  if (!changed) return false;
  state.incomingTruceRequests = incoming;
  state.outgoingTruceRequests = outgoing;
  return true;
};

/** Checks once a second and re-renders the HUD only when an offer actually expired. */
export const startTruceRequestExpiryTicker = (state: TruceRequestState, renderHud: () => void): void => {
  setInterval(() => {
    if (dropExpiredTruceRequests(state, Date.now())) renderHud();
  }, 1_000);
};
