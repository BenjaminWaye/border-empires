// The standings ledger: one row per House with its score medal, name and
// gauges. Drawn on the season-end screen ("Final Standings") and on the join
// card's waiting view ("Current Standings", client-join-season-waiting/).
// The se-* styles live in client-season-end-overlay.css.
import type { LeaderboardOverallEntry } from "../client-types.js";
import { escapeHtml } from "./client-season-end-html.js";

export type StandingsLeaderboard = { overall: LeaderboardOverallEntry[]; selfOverall: LeaderboardOverallEntry | undefined };

export const safeColorValue = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  return /^#[0-9a-fA-F]{3,8}$/.test(raw) ? raw : undefined;
};

export const playerBadge = (
  playerId: string | undefined,
  name: string,
  colors: ReadonlyMap<string, string>
): string => {
  const color = safeColorValue(playerId ? colors.get(playerId) : undefined);
  return `<span class="se-badge"><span class="se-badge-dot${color ? "" : " is-unknown"}"${
    color ? ` style="--player-color:${color}"` : ""
  } aria-hidden="true"></span><span class="se-badge-name">${escapeHtml(name)}</span></span>`;
};

const rankClass = (rank: number): string =>
  rank === 1 ? "is-gold" : rank === 2 ? "is-silver" : rank === 3 ? "is-bronze" : "";

const num = (value: number, digits = 0): string =>
  value.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const rankRowHtml = (
  entry: LeaderboardOverallEntry,
  colors: ReadonlyMap<string, string>,
  options: { self: boolean; detached?: boolean; winnerId: string | undefined }
): string => {
  // Score rank (the gold/silver/bronze medal) and the season winner (the
  // crown) are independent -- the winner is decided by their victory path,
  // not necessarily by having the top score. Swapping the medal's number for
  // a crown while keeping its rank-based color (e.g. silver) read as if 2nd
  // place had won, so the crown is now a separate badge next to the name and
  // the medal always shows the entry's true score rank.
  const isWinner = Boolean(options.winnerId && entry.id === options.winnerId);
  const medalClass = options.detached ? "" : rankClass(entry.rank);
  const crown = isWinner ? `<span class="se-rank-crown" title="Contest Victor" aria-hidden="true">♔</span>` : "";
  return `
    <li class="se-rank-row${options.self ? " is-self" : ""}${options.detached ? " is-detached" : ""}${isWinner ? " is-winner" : ""}">
      <span class="se-rank-medal ${medalClass}">${entry.rank}</span>
      <span class="se-rank-name">${crown}${playerBadge(entry.id, options.self ? "You" : entry.name, colors)}</span>
      <span class="se-rank-stats">
        <span class="se-gauge" title="Score"><em>${num(entry.score, 1)}</em><span>score</span></span>
        <span class="se-gauge" title="Garrisoned tiles"><em>${num(entry.tiles)}</em><span>tiles</span></span>
        <span class="se-gauge" title="Income / day"><em>${num(entry.incomePerMinute * 1440, 1)}</em><span>coin/day</span></span>
        <span class="se-gauge" title="Manifests"><em>${num(entry.techs)}</em><span>manifests</span></span>
      </span>
    </li>`;
};

export const standingsLedger = (
  leaderboard: StandingsLeaderboard,
  colors: ReadonlyMap<string, string>,
  selfId: string | undefined,
  winnerId: string | undefined,
  title = "Final Standings"
): string => {
  const rows = leaderboard.overall
    .map((entry) => rankRowHtml(entry, colors, { self: Boolean(selfId && entry.id === selfId), winnerId }))
    .join("");
  const self = leaderboard.selfOverall;
  const selfFooter =
    self && self.rank !== 1 && !leaderboard.overall.some((entry) => entry.id === self.id)
      ? rankRowHtml(self, colors, { self: true, detached: true, winnerId })
      : "";
  return `
    <section class="se-panel se-standings">
      <h3 class="se-panel-title">${escapeHtml(title)}</h3>
      <ol class="se-rank-list">${rows}${selfFooter}</ol>
    </section>`;
};
