// Player profile data and links. Clicking a player's name anywhere it is
// rendered via playerNameBadgeHtml (leaderboard, alliance lists, etc.) opens
// that player's profile, which the HUD draws as its profile screen; this
// module loads the galactic holdings, career stats and social view it shows.
import type { ClientDom } from "../client-auth-flow/client-auth-flow-types.js";
import type { ClientState } from "../client-state/client-state.js";
import { fetchGalaxyHoldings } from "./client-player-profile-galaxy.js";
import { fetchCareerStats } from "./client-player-profile-career.js";
import { fetchPlayerSocialView } from "./client-player-profile-social.js";

const MAX_CACHED_GALAXY_HOLDINGS = 50;

// Generic "fetch once per profile, cache for the session, cap the cache
// size" helper shared by the galactic-holdings and career-stats fetches
// below -- both need identical semantics (loading placeholder, cache a
// failure as an empty/default result rather than deleting the entry, so a
// re-render doesn't re-arm the fetch and retry-storm).
const fetchAndCacheOnce = <T>(
  cache: Map<string, T | "loading">,
  profileId: string,
  fetcher: () => Promise<T | undefined>,
  fallback: T,
  activePlayerProfileId: () => string | undefined,
  rerender: () => void
): void => {
  if (cache.has(profileId)) return;
  if (cache.size >= MAX_CACHED_GALAXY_HOLDINGS) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey !== undefined) cache.delete(oldestKey);
  }
  cache.set(profileId, "loading");
  void fetcher().then((result) => {
    cache.set(profileId, result ?? fallback);
    if (activePlayerProfileId() === profileId) rerender();
  });
};

/** Loads what the profile screen reads for whichever player's profile is open. */
export const fetchActivePlayerProfileData = (
  state: Pick<ClientState, "activePlayerProfileId" | "galaxyHoldingsByPlayerId" | "careerStatsByPlayerId" | "socialViewByPlayerId">,
  wsUrl: string,
  rerender: () => void
): void => {
  const profileId = state.activePlayerProfileId;
  if (!profileId) return;
  const activeId = () => state.activePlayerProfileId;
  fetchAndCacheOnce(state.galaxyHoldingsByPlayerId, profileId, () => fetchGalaxyHoldings(profileId, wsUrl), { planets: [], outposts: [], trophyCase: [] }, activeId, rerender);
  fetchAndCacheOnce(state.careerStatsByPlayerId, profileId, () => fetchCareerStats(profileId, wsUrl), { seasonsPlayed: 0, bestRank: null, peakScore: null, peakTiles: null }, activeId, rerender);
  fetchAndCacheOnce(state.socialViewByPlayerId, profileId, () => fetchPlayerSocialView(profileId, wsUrl), { allies: [], activeTruces: [], truceBreaksThisSeason: [] }, activeId, rerender);
};

/** Every player name in the HUD opens that player's profile screen. */
export const wirePlayerNameLinks = (
  dom: Pick<ClientDom, "hud">,
  state: Pick<ClientState, "activePlayerProfileId">,
  rerender: () => void
): void => {
  (dom.hud.querySelectorAll("[data-player-name-id]") as NodeListOf<HTMLElement>).forEach((el) => {
    el.onclick = () => {
      const playerId = el.dataset.playerNameId;
      if (!playerId) return;
      state.activePlayerProfileId = playerId;
      rerender();
    };
  });
};
