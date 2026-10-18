/**
 * Replays a player's latest change-driven sim push -- REACH_UPDATE and
 * AETHER_SHIELDS -- to a socket that joined after it was pushed.
 *
 * Why this exists: the simulation pushes both once per *live SubscribePlayer*
 * (apps/simulation/src/simulation-service/live-subscribe-reach-push.ts) and
 * afterwards only when they change (REACH_UPDATE: the change-filtered
 * per-tick flush; AETHER_SHIELDS: aether-shield-broadcast.ts). But the
 * gateway only issues that RPC for a player's *first* socket:
 * `playerSubscriptions.ensureSubscribed` short-circuits to the cached
 * snapshot whenever the player is already subscribed. So any login that
 * lands while the same player already has a socket attached — a second tab
 * or device, or an in-page reconnect while the gateway still holds the
 * previous connection's not-yet-reaped socket (the ws heartbeat takes up to
 * ~30-60s to notice a dead peer) — never triggers a push. The PreparePlayer
 * hello cannot cover it either: it runs before the new socket is attached, so
 * it reaches only the older sockets. That client would get nothing until the
 * value next changes, which for a stable empire can be the whole session:
 * for reach it falls back to `computeLocalReachSet`, the approximation the
 * waypoint planner then uses to plan EXPANDs the server rejects as
 * OUT_OF_REACH; for Aether shields it tints only towers it can see.
 *
 * The gateway sees every such push while a player has a socket attached, so
 * it keeps the latest one of each type per player and hands each newly-authed
 * socket whichever it did not already receive. Re-sending is safe: the client
 * drops any REACH_UPDATE revision at or below the one it already applied
 * (packages/client/src/client-reach-authoritative/client-reach-authoritative.ts),
 * and AETHER_SHIELDS is a full replacement list.
 *
 * Bounds (docs/agents/state-and-persistence-discipline.md): one entry per
 * player (holding at most one payload per replayed type), dropped by `forget`
 * when the player's last socket detaches, plus a hard `maxEntries` cap
 * evicting the least-recently-updated player as a backstop should a
 * disconnect path ever skip `forget`. `onSizeChange` and `onEvict` feed the
 * gateway's gauge and eviction counter.
 */

export type ReplayedPlayerMessageType = "REACH_UPDATE" | "AETHER_SHIELDS" | "AFC_FLAG_DETECTIONS";
export type ReplayedPlayerMessage = Record<string, unknown> & { type: ReplayedPlayerMessageType };

export type PlayerMessageReplayOptions = {
  maxEntries: number;
  onSizeChange: (entryCount: number) => void;
  onEvict: () => void;
};

export type PlayerMessageReplay<TSocket extends object> = {
  /** Records a replayed-type payload the gateway just fanned out to `recipients`. Any other payload is ignored. */
  observe: (playerId: string, payload: Record<string, unknown>, recipients: Iterable<TSocket>) => void;
  /** Sends `socket` each of the player's latest payloads it doesn't already have. Returns whether it sent any. */
  replayTo: (playerId: string, socket: TSocket, send: (socket: TSocket, payload: ReplayedPlayerMessage) => void) => boolean;
  /** Drops the player's entry — call once the player has no sockets left. */
  forget: (playerId: string) => void;
  size: () => number;
};

type ReplayEntry<TSocket extends object> = {
  payload: ReplayedPlayerMessage;
  deliveredTo: WeakSet<TSocket>;
};

/** Only well-formed payloads of the replayed types are kept. */
export const isReplayedPlayerMessage = (payload: Record<string, unknown>): payload is ReplayedPlayerMessage =>
  (payload.type === "REACH_UPDATE" && Array.isArray(payload.tileKeys)) || (payload.type === "AETHER_SHIELDS" && Array.isArray(payload.towers)) ||
  (payload.type === "AFC_FLAG_DETECTIONS" && Array.isArray(payload.flags));

export const createPlayerMessageReplay = <TSocket extends object>(options: PlayerMessageReplayOptions): PlayerMessageReplay<TSocket> => {
  const maxEntries = Math.max(1, Math.floor(options.maxEntries));
  const entries = new Map<string, Map<ReplayedPlayerMessageType, ReplayEntry<TSocket>>>();

  return {
    observe(playerId, payload, recipients) {
      if (!isReplayedPlayerMessage(payload)) return;
      const deliveredTo = new WeakSet<TSocket>();
      for (const socket of recipients) deliveredTo.add(socket);
      // Latest arrival of each type wins (the gateway relays the simulation's
      // stream in order). Delete-then-set keeps Map order = least-recently-updated first.
      const byType = entries.get(playerId) ?? new Map<ReplayedPlayerMessageType, ReplayEntry<TSocket>>();
      byType.set(payload.type, { payload, deliveredTo });
      entries.delete(playerId);
      entries.set(playerId, byType);
      while (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (oldest.done) break;
        entries.delete(oldest.value);
        options.onEvict();
      }
      options.onSizeChange(entries.size);
    },
    replayTo(playerId, socket, send) {
      let sent = false;
      for (const entry of entries.get(playerId)?.values() ?? []) {
        if (entry.deliveredTo.has(socket)) continue;
        entry.deliveredTo.add(socket);
        send(socket, entry.payload);
        sent = true;
      }
      return sent;
    },
    forget(playerId) {
      if (!entries.delete(playerId)) return;
      options.onSizeChange(entries.size);
    },
    size: () => entries.size
  };
};
