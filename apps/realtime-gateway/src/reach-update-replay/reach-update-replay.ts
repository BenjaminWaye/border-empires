/**
 * Replays a player's latest REACH_UPDATE to a socket that joined after it was
 * pushed.
 *
 * Why this exists: the simulation pushes the authoritative reach border once
 * per *live SubscribePlayer* (apps/simulation/src/simulation-service/
 * live-subscribe-reach-push.ts) and afterwards only when the border changes
 * (change-filtered per-tick flush). But the gateway only issues that RPC for a
 * player's *first* socket: `playerSubscriptions.ensureSubscribed` short-circuits
 * to the cached snapshot whenever the player is already subscribed. So any
 * login that lands while the same player already has a socket attached — a
 * second tab or device, or an in-page reconnect while the gateway still holds
 * the previous connection's not-yet-reaped socket (the ws heartbeat takes up to
 * ~30-60s to notice a dead peer) — never triggers a push. The PreparePlayer
 * hello cannot cover it either: it runs before the new socket is attached, so
 * it reaches only the older sockets. That client gets no REACH_UPDATE until the
 * border next changes, which for a stable empire can be the whole session, and
 * falls back to `computeLocalReachSet` — the approximation the waypoint planner
 * then uses to plan EXPANDs the server rejects as OUT_OF_REACH.
 *
 * The gateway sees every REACH_UPDATE while a player has a socket attached,
 * so it keeps the latest one per player and hands it to each newly-authed
 * socket that did not already receive it. Re-sending the same payload is safe:
 * the client drops any revision at or below the one it already applied
 * (packages/client/src/client-reach-authoritative/client-reach-authoritative.ts).
 *
 * Bounds (docs/agents/state-and-persistence-discipline.md): one entry per
 * player, dropped by `forget` when the player's last socket detaches, plus a
 * hard `maxEntries` cap evicting the least-recently-updated entry as a backstop
 * should a disconnect path ever skip `forget`. `onSizeChange` and `onEvict`
 * feed the gateway's gauge and eviction counter.
 */

export type ReachUpdatePayload = Record<string, unknown> & { type: "REACH_UPDATE" };

export type ReachUpdateReplayOptions = {
  maxEntries: number;
  onSizeChange: (entryCount: number) => void;
  onEvict: () => void;
};

export type ReachUpdateReplay<TSocket extends object> = {
  /** Records a REACH_UPDATE the gateway just fanned out to `recipients`. Non-REACH_UPDATE payloads are ignored. */
  observe: (playerId: string, payload: Record<string, unknown>, recipients: Iterable<TSocket>) => void;
  /** Sends the player's latest REACH_UPDATE to `socket` unless it already has it. Returns whether it sent. */
  replayTo: (playerId: string, socket: TSocket, send: (socket: TSocket, payload: ReachUpdatePayload) => void) => boolean;
  /** Drops the player's entry — call once the player has no sockets left. */
  forget: (playerId: string) => void;
  size: () => number;
};

type ReplayEntry<TSocket extends object> = {
  payload: ReachUpdatePayload;
  deliveredTo: WeakSet<TSocket>;
};

const isReachUpdatePayload = (payload: Record<string, unknown>): payload is ReachUpdatePayload =>
  payload.type === "REACH_UPDATE" && Array.isArray(payload.tileKeys);

export const createReachUpdateReplay = <TSocket extends object>(options: ReachUpdateReplayOptions): ReachUpdateReplay<TSocket> => {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries));
  const entries = new Map<string, ReplayEntry<TSocket>>();

  return {
    observe(playerId, payload, recipients) {
      if (!isReachUpdatePayload(payload)) return;
      const deliveredTo = new WeakSet<TSocket>();
      for (const socket of recipients) deliveredTo.add(socket);
      // Latest arrival wins (the gateway relays the simulation's stream in
      // order). Delete-then-set keeps Map order = least-recently-updated first.
      entries.delete(playerId);
      entries.set(playerId, { payload, deliveredTo });
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
        options.onEvict();
      }
      options.onSizeChange(entries.size);
    },
    replayTo(playerId, socket, send) {
      const entry = entries.get(playerId);
      if (!entry || entry.deliveredTo.has(socket)) return false;
      entry.deliveredTo.add(socket);
      send(socket, entry.payload);
      return true;
    },
    forget(playerId) {
      if (!entries.delete(playerId)) return;
      options.onSizeChange(entries.size);
    },
    size: () => entries.size
  };
};
