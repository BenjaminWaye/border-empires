import type { ClientState } from "../client-state/client-state.js";
import { refreshDiplomacyTradeScreen } from "../client-diplomacy-trade/client-diplomacy-trade.js";
import type { TruceRequest } from "../client-types.js";

type TruceRequestState = Pick<ClientState, "incomingTruceRequests" | "outgoingTruceRequests">;

/**
 * Truce offers expire after TRUCE_REQUEST_TTL_MS (5 min). The gateway tells
 * both players about an expired offer on its next minute-long maintenance run
 * (socialState.takeStaleOfferSync), so without a local check a dead offer
 * could sit in the Alliances panel and the ally badge for up to a minute, and
 * Accept would fail with TRUCE_REQUEST_INVALID ("request invalid or expired").
 *
 * expiresAt/createdAt are server timestamps and the client has no server
 * clock offset, so comparing expiresAt with Date.now() would hide offers early
 * (or at once) on a device whose clock runs fast. Instead each offer gets its
 * server-side lifetime (expiresAt - createdAt) counted from when this client
 * first saw it. An offer first seen late (e.g. after a reload) can outlive its
 * server expiry here; the gateway's push clears it.
 *
 * Returns a function that drops expired offers and says whether it dropped any.
 */
export const createTruceRequestExpiry = (): ((state: TruceRequestState, nowMs: number) => boolean) => {
  // Bounded: pruned to the offers still in state on every call.
  const firstSeenAtById = new Map<string, number>();
  const isLive = (request: TruceRequest, nowMs: number): boolean => {
    const lifetimeMs = request.expiresAt - request.createdAt;
    // A malformed offer stays; the server rejects it and resyncs if it is dead.
    if (!Number.isFinite(lifetimeMs)) return true;
    let firstSeenAt = firstSeenAtById.get(request.id);
    if (firstSeenAt === undefined) {
      firstSeenAt = nowMs;
      firstSeenAtById.set(request.id, firstSeenAt);
    }
    return firstSeenAt + lifetimeMs > nowMs;
  };
  return (state, nowMs) => {
    const incoming = state.incomingTruceRequests.filter((request) => isLive(request, nowMs));
    const outgoing = state.outgoingTruceRequests.filter((request) => isLive(request, nowMs));
    const liveIds = new Set([...incoming, ...outgoing].map((request) => request.id));
    for (const id of firstSeenAtById.keys()) if (!liveIds.has(id)) firstSeenAtById.delete(id);
    const changed = incoming.length !== state.incomingTruceRequests.length || outgoing.length !== state.outgoingTruceRequests.length;
    if (!changed) return false;
    state.incomingTruceRequests = incoming;
    state.outgoingTruceRequests = outgoing;
    return true;
  };
};

/**
 * Checks once a second. When an offer expires it re-renders the HUD and the
 * counter-offer screen (as a TRUCE_UPDATE would), so neither keeps showing it.
 */
export const startTruceRequestExpiryTicker = (
  state: TruceRequestState,
  renderHud: () => void,
  refreshTradeScreen: () => void = refreshDiplomacyTradeScreen
): void => {
  const dropExpired = createTruceRequestExpiry();
  setInterval(() => {
    if (!dropExpired(state, Date.now())) return;
    refreshTradeScreen();
    renderHud();
  }, 1_000);
};
