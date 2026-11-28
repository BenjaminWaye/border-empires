// Lands human Houses that are online and waiting for a landing site.
//
// Owner decision 2026-11-27: a human House lands only on a viable site (see
// runtime-respawn-helpers.ts), so on a full map a House knocked out stays
// landless. Until now it was tried again only at its player's next login.
// This runs once a minute (simulation-service.ts) for the players online now:
// any with no reach (a landless House has none) gets the same landing a login
// would give, but only while the landing-site probe's cached answer says a
// viable site exists, so a full map costs one cached lookup a minute.
// Chosen by the agent on the owner's delegation (2026-11-28); the PR says why.
import { isSeasonActive } from "../season-lifecycle.js";
import { landingSiteAvailable } from "../landing-site-probe/landing-site-probe.js";
import { announcePreparedPlayer, type PrepareOrJoinDeps } from "../simulation-service/prepare-and-join-player.js";

export const LAND_WAITING_HOUSES_INTERVAL_MS = 60_000;

type LandWaitingDeps = Pick<PrepareOrJoinDeps, "runtime" | "log" | "deleteCachedSnapshot" | "getSeasonState">;

/** Returns how many waiting Houses landed. */
export const landWaitingHouses = (deps: LandWaitingDeps, onlinePlayerIds: readonly string[]): number => {
  if (!isSeasonActive(deps.getSeasonState())) return 0;
  const waiting = onlinePlayerIds.filter((playerId) => deps.runtime.hasPlayer(playerId) && deps.runtime.reachTileCountForPlayer(playerId) === 0);
  if (waiting.length === 0 || !landingSiteAvailable(deps.runtime)) return 0;
  let landed = 0;
  for (const playerId of waiting) {
    // A House that still holds land (but no reach) is left alone: the call returns false at once.
    if (!deps.runtime.ensurePlayerHasSpawnTerritory(playerId)) continue;
    landed += 1;
    deps.deleteCachedSnapshot(playerId);
    deps.log.info({ playerId }, "landed a House that was waiting for a landing site");
    announcePreparedPlayer(deps, playerId);
  }
  return landed;
};
