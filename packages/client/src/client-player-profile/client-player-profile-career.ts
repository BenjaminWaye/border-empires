// Career Stats section of the player profile (seasons played, best rank,
// peak score/tiles), split out of client-player-profile.ts to keep that file
// focused, mirroring client-player-profile-galaxy.ts's structure. Fetches
// from the public GET /hq/career/by-player/:playerId route
// (career-routes.ts), sourced from the simulation's full per-season
// leaderboard snapshot (season_participation), not the top-5 truncated into
// the galaxy layer's season_archive -- so this works for any player, not
// just top finishers.
import { rallyApiOrigin } from "../client-rally-links/client-rally-links.js";
import type { CareerStatsView } from "./client-player-profile-types.js";


export const fetchCareerStats = async (playerId: string, wsUrl: string): Promise<CareerStatsView | undefined> => {
  try {
    const response = await fetch(`${rallyApiOrigin(wsUrl)}/hq/career/by-player/${encodeURIComponent(playerId)}`, {
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return undefined;
    const body = (await response.json().catch(() => undefined)) as Partial<CareerStatsView> | undefined;
    if (!body) return undefined;
    return {
      seasonsPlayed: body.seasonsPlayed ?? 0,
      bestRank: body.bestRank ?? null,
      peakScore: body.peakScore ?? null,
      peakTiles: body.peakTiles ?? null,
      rating: body.rating ?? null,
      lastRatingDelta: body.lastRatingDelta ?? null,
      peakRating: body.peakRating ?? null
    };
  } catch {
    return undefined;
  }
};

