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

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);

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
      peakTiles: body.peakTiles ?? null
    };
  } catch {
    return undefined;
  }
};

export const careerStatsHtml = (stats: CareerStatsView | "loading" | undefined): string => {
  if (stats === "loading" || stats === undefined) return "";
  if (stats.seasonsPlayed === 0) return "";
  return `<div class="intel-stockpile">
    <div class="intel-section-label">Career Stats</div>
    <ul class="intel-simple-list">
      <li>Seasons played: <strong>${escapeHtml(String(stats.seasonsPlayed))}</strong></li>
      ${stats.bestRank !== null ? `<li>Best rank finish: <strong>#${escapeHtml(String(stats.bestRank))}</strong></li>` : ""}
      ${stats.peakScore !== null ? `<li>Peak score: <strong>${escapeHtml(stats.peakScore.toFixed(0))}</strong></li>` : ""}
      ${stats.peakTiles !== null ? `<li>Peak tiles held: <strong>${escapeHtml(String(Math.round(stats.peakTiles)))}</strong></li>` : ""}
    </ul>
  </div>`;
};
