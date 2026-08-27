// Offline grace-period gate + tick-driven trigger for the waypoint/expand
// queue's server-side auto-drain (runtime-waypoint-drain.ts) -- see
// docs/waypoint-client-planning-plan.md §3/§4. Extracted into its own
// module (rather than added inline to runtime.ts, already over the repo's
// per-file line cap) so runtime.ts only grows by the small amount needed to
// wire it in.
//
// The sim already tracks subscription state (isPlayerSubscribed) but not
// *when* a player last dropped -- this module is that missing presence
// timestamp, recorded from the tick loop's own polling of isPlayerSubscribed
// rather than inventing a parallel connect/disconnect event source.
import { WAYPOINT_OFFLINE_GRACE_MS } from "@border-empires/shared";

export type WaypointDrainSchedulerDeps = {
  isPlayerSubscribed: (playerId: string) => boolean;
  now: () => number;
};

export class WaypointDrainScheduler {
  private readonly lastDisconnectedAtByPlayer = new Map<string, number>();
  private readonly deps: WaypointDrainSchedulerDeps;

  constructor(deps: WaypointDrainSchedulerDeps) {
    this.deps = deps;
  }

  /** Call once per tick per candidate player (before checking eligibility)
   *  to keep the presence timestamp current. Reconnect clears it instantly
   *  -- that's what makes handback on reconnect instantaneous: no in-flight
   *  server leg is cancelled, but no new one starts once this flips. */
  notePresence(playerId: string): void {
    const subscribed = this.deps.isPlayerSubscribed(playerId);
    if (subscribed) {
      this.lastDisconnectedAtByPlayer.delete(playerId);
      return;
    }
    if (!this.lastDisconnectedAtByPlayer.has(playerId)) {
      this.lastDisconnectedAtByPlayer.set(playerId, this.deps.now());
    }
  }

  /** True only once this player has been disconnected for at least
   *  WAYPOINT_OFFLINE_GRACE_MS -- long enough that a page refresh or a
   *  flaky reconnect never triggers a server drain cycle. */
  isDrainEligible(playerId: string): boolean {
    this.notePresence(playerId);
    const disconnectedAt = this.lastDisconnectedAtByPlayer.get(playerId);
    if (disconnectedAt === undefined) return false;
    return this.deps.now() - disconnectedAt >= WAYPOINT_OFFLINE_GRACE_MS;
  }

  /** Test/diagnostic hook: current recorded disconnect timestamp, if any. */
  lastDisconnectedAt(playerId: string): number | undefined {
    return this.lastDisconnectedAtByPlayer.get(playerId);
  }
}

export type WaypointDrainTickDeps = {
  scheduler: WaypointDrainScheduler;
  playerIdsWithWaypointQueue: () => string[];
  drainForPlayer: (playerId: string) => void;
};

/** Per-tick hook: drain every eligible player's non-empty waypoint queue by
 *  (at most) one leg. Wired from the sim's own tick loop, not gated on an
 *  active gateway connection, so it keeps walking the queue while the
 *  player is offline. */
export const tickWaypointDrain = (deps: WaypointDrainTickDeps): void => {
  for (const playerId of deps.playerIdsWithWaypointQueue()) {
    if (!deps.scheduler.isDrainEligible(playerId)) continue;
    deps.drainForPlayer(playerId);
  }
};
