// How long a SETTLE (shown to players as Garrison) takes. There is no separate
// garrison timer: a garrison takes exactly as long as an EXPAND (frontier
// claim) on the same tile, forest/hills penalties included, so the two can
// never drift apart. A player's first INSTANT_GARRISON_COUNT garrisons are
// instant; the lifetime count lives on the persistent player record
// (DomainPlayer.lifetimeGarrisons) and survives respawns.
import { frontierClaimDurationMsAt } from "../frontier-claim-duration/frontier-claim-duration.js";

/** Lifetime garrisons a player gets with no timer (0 ms). */
export const INSTANT_GARRISON_COUNT = 10;

/** Garrison time on (x, y) before settle-speed effects: the frontier claim time. */
export const garrisonBaseDurationMsAt = (x: number, y: number): number => frontierClaimDurationMsAt(x, y);

/** Instant garrisons left for a player who has started `lifetimeGarrisons` garrisons (missing = 0, for records that predate the counter). */
export const instantGarrisonsRemaining = (lifetimeGarrisons: number | undefined): number =>
  Math.max(0, INSTANT_GARRISON_COUNT - Math.max(0, Math.floor(lifetimeGarrisons ?? 0)));

/** True when the player's next garrison is one of their free instant ones. */
export const nextGarrisonIsInstant = (lifetimeGarrisons: number | undefined): boolean =>
  instantGarrisonsRemaining(lifetimeGarrisons) > 0;
