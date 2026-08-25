/**
 * Authoritative reach push on live (re)subscribe.
 *
 * Why this exists rather than the per-connect hello alone
 * (`per-connect-hellos.ts`): the reach resend fired from PreparePlayer runs
 * too early in the login handshake to reach the client. The gateway's connect
 * sequence is
 *
 *   1. `simulationClient.preparePlayer(...)`   (gateway-app.ts)
 *   2. `simulationClient.subscribePlayer(... "bootstrap-only" ...)`
 *   3. `playerSubscriptions.attachSocket(playerId, socket)`
 *   4. `playerSubscriptions.ensureSubscribed(playerId)`  -> live SubscribePlayer
 *
 * `resendReachForPlayer` runs synchronously inside step 1, so the REACH_UPDATE
 * it emits streams back to the gateway before step 3 has registered any socket
 * for the player. The gateway's PLAYER_MESSAGE forwarder resolves
 * `socketsForPlayer(...)` to an empty set and drops the message with only a
 * `gateway_simulation_event_no_subscribers` warning — no retry, no queue.
 *
 * That drop is normally invisible: the border usually has not changed while the
 * player was away, so the client's own approximation still matches. It becomes
 * a hard, permanent desync when the border DID change offline — a reach anchor
 * (Relay Beacon and friends) finishing on the build-completion timer while the
 * player was disconnected. That mutation updates
 * `lastEmittedSignatureByPlayer` to the new border as it emits to nobody, so
 * the change-filtered flush will never re-send it either: the forced resend on
 * connect is the only remaining delivery, and it is exactly the one being
 * dropped. The client falls back to `computeLocalReachSet`, renders the old
 * border, and — because the waypoint planner shares that same resolver — keeps
 * planning against reach the server does not grant.
 *
 * Step 4 is the first point in the handshake where the socket is guaranteed
 * attached, so pushing from here lands on a real subscriber. If login has not
 * sent `init` yet the gateway's `queueOrSendSessionPayload` buffers the
 * payload in `session.pendingPayloads` and flushes it after init, so arriving
 * "early" within step 4 is safe.
 *
 * The PreparePlayer hello is deliberately left in place rather than moved:
 * JOIN_SEASON also routes through it, and a season join happens long after
 * login with the socket already attached, so there the hello does land. The
 * two paths are safe to both fire because `buildReachUpdatePayload` draws from
 * one monotonic per-player revision and the client drops any arrival at or
 * below the revision it already applied (`applyServerReachUpdate`).
 *
 * Cost: at most one REACH_UPDATE per live subscribe — replacing the one that
 * was already being built and thrown away at step 1. No new message on any
 * hot path, and the per-tick flush keeps its signature dedup untouched.
 */

/** The subscription bookkeeping this module registers into. */
export type LiveSubscribeRegistry = {
  subscribe: (playerId: string, subscriptionKey?: string) => void;
};

/** The runtime capability this module needs: force a reach re-push. */
export type LiveSubscribeReachRuntime = {
  resendReachForPlayer: (playerId: string) => void;
};

export type LiveSubscribeReachLog = {
  error: (payload: Record<string, unknown>, message: string) => void;
};

/**
 * Registers a live subscription and pushes the player's authoritative reach.
 *
 * Bootstrap-only subscribes must not call this — they run before the socket is
 * attached (step 2 above) and do not register a subscription at all.
 *
 * The reach push is isolated so a failure cannot take down the subscribe RPC
 * that carries the player's whole world state; a client that misses reach
 * falls back to its local approximation, which is degraded but playable,
 * whereas a failed subscribe rejects the login outright.
 */
export const registerLiveSubscribeAndPushReach = (
  registry: LiveSubscribeRegistry,
  runtime: LiveSubscribeReachRuntime,
  playerId: string,
  subscriptionKey: string | undefined,
  log: LiveSubscribeReachLog
): void => {
  registry.subscribe(playerId, subscriptionKey);
  try {
    runtime.resendReachForPlayer(playerId);
  } catch (error) {
    log.error({ err: error, playerId }, "live subscribe reach push failed");
  }
};
