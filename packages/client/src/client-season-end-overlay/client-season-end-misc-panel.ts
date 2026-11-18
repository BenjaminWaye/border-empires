import type { SeasonStatsView } from "../client-types.js";
import { escapeHtml, missingHistoryNotice } from "./client-season-end-html.js";

// "Contest Miscellany" panel of the season-end overlay (deadliest tile,
// longest road), extracted from client-season-end-overlay.ts to keep that
// file under the line cap.

const num = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const miscPanel = (
  stats: SeasonStatsView | undefined,
  // Renders a player badge using the freshest known display name.
  namedPlayer: (id: string, name: string | undefined) => string
): string => {
  const deadly = stats?.mostDeadlyTile;
  const road = stats?.longestRoad;
  const player = deadly?.mostLossesPlayer;
  const deadlyDetails = deadly
    ? `<strong>${num(deadly.manpowerLost)}</strong> manpower lost on tile (${deadly.x}, ${deadly.y})
      ${player
        ? `<br>Most losses: ${namedPlayer(player.playerId, player.playerName)} · <strong>${num(player.manpowerLost)}</strong> manpower`
        : missingHistoryNotice("deadliest-tile", "Deadliest tile player losses", "Player loss history unavailable.")}`
    : missingHistoryNotice("deadliest-tile", "Most Deadly Tile", "No combat record available.");
  const city = (value: { name: string; x: number; y: number }): string =>
    `${escapeHtml(value.name)} (${value.x}, ${value.y})`;
  let roadDetails: string;
  if (!road) {
    roadDetails = missingHistoryNotice("longest-road", "Longest Road", "No connected road recorded.");
  } else {
    const endpoints = road.fromCity && road.toCity ? `${city(road.fromCity)} ↔ ${city(road.toCity)}` : "";
    roadDetails = `${road.playerId ? `${namedPlayer(road.playerId, road.playerName)} · ` : ""}<strong>${num(road.tileCount)}</strong> tiles long
      ${endpoints ? `<br>${endpoints}` : ""}`;
    if (!road.playerId && !endpoints) {
      roadDetails += missingHistoryNotice("longest-road", "Longest Road owner and cities", "Road owner and city details unavailable.");
    } else if (!road.playerId) {
      roadDetails += missingHistoryNotice("longest-road", "Longest Road owner", "Road owner unavailable.");
    } else if (!endpoints) {
      roadDetails += missingHistoryNotice("longest-road", "Longest Road cities", "City details unavailable.");
    }
  }
  return `<section class="se-panel se-misc">
    <h3 class="se-panel-title">Contest Miscellany</h3>
    <div class="se-misc-items">
      <div class="se-misc-item">
        <span class="se-misc-label">Most Deadly Tile</span>
        <div class="se-misc-value">${deadlyDetails}</div>
      </div>
      <div class="se-misc-item">
        <span class="se-misc-label">Longest Road</span>
        <div class="se-misc-value">${roadDetails}</div>
      </div>
    </div>
  </section>`;
};
