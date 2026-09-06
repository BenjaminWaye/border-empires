// Player profile modal, opened by clicking a player's name anywhere it's
// rendered via playerNameBadgeHtml (leaderboard, alliance lists, etc.).
// Reuses the .intel-* modal classes from client-empire-intel.ts's dossier so
// this fits the existing visual language without new CSS.
//
// Scope note: the season snapshot (rank/tiles/income/techs) comes from the
// leaderboard, which is broadcast to every client, so it works for any
// player. The oathbreaker section only has data for the *viewing* player --
// the gateway's SocialSnapshot is per-viewer (see social-state.ts), so there
// is not yet a way to fetch another player's truce-break history. Until that
// exists, the oathbreaker section is shown only when profiling yourself.
import type { ActiveTruceView, LeaderboardOverallEntry } from "../client-types.js";
import type { TruceBreakView } from "./client-player-profile-types.js";
import type { ClientDom } from "../client-auth-flow/client-auth-flow-types.js";
import type { ClientState } from "../client-state/client-state.js";
import { selfPlayerIdFromLeaderboard, socialRemainingLabel } from "../client-panel-html/client-panel-html.js";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" })[char] ?? char);

const formatInt = (value: number): string => Math.round(value).toLocaleString();

const relativeTimeAgo = (atMs: number, nowMs: number): string => {
  const deltaMs = Math.max(0, nowMs - atMs);
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

const statCardHtml = (label: string, value: string): string => `
  <div class="intel-stat-card">
    <div class="intel-stat-label">${escapeHtml(label)}</div>
    <div class="intel-stat-value">${escapeHtml(value)}</div>
  </div>`;

export type PlayerProfileArgs = {
  profilePlayerId: string;
  viewerPlayerId: string;
  playerName: string;
  leaderboardOverall: LeaderboardOverallEntry[];
  allies: string[];
  activeTruces: ActiveTruceView[];
  truceBreaksThisSeason: TruceBreakView[];
  nowMs: number;
};

export const playerProfileHtml = (args: PlayerProfileArgs): string => {
  const {
    profilePlayerId, viewerPlayerId, playerName, leaderboardOverall,
    allies, activeTruces, truceBreaksThisSeason, nowMs
  } = args;
  const isSelf = profilePlayerId === viewerPlayerId;
  const entry = leaderboardOverall.find((player) => player.id === profilePlayerId);
  const isAllied = allies.includes(profilePlayerId);
  const truceWithViewer = activeTruces.find((truce) => truce.otherPlayerId === profilePlayerId);
  // Only meaningful for a self-profile today -- see the scope note above.
  const oathbreakerBreaks = isSelf ? truceBreaksThisSeason : [];

  const relationshipLabel = isAllied ? "Allied" : truceWithViewer ? "Truce" : "No pact";

  const oathbreakerBadgeHtml = oathbreakerBreaks.length > 0
    ? `<span class="intel-kicker" style="color:#f59e0b">⚠ Oathbreaker (${oathbreakerBreaks.length} this season)</span>`
    : "";

  const oathbreakerListHtml = oathbreakerBreaks.length > 0
    ? `<div class="intel-stockpile">
        <div class="intel-section-label">Broken truces this season</div>
        <ul class="intel-oathbreaker-list">
          ${oathbreakerBreaks
            .slice()
            .reverse()
            .map(
              (record) =>
                `<li>Broke truce with <strong>${escapeHtml(record.targetPlayerName)}</strong> — ${relativeTimeAgo(record.brokenAt, nowMs)}</li>`
            )
            .join("")}
        </ul>
      </div>`
    : "";

  const truceStatusHtml = truceWithViewer
    ? `<p class="intel-summary">You have an active truce with this player, ending in ${socialRemainingLabel(truceWithViewer.endsAt, nowMs)}.</p>`
    : "";

  return `
    <div class="intel-backdrop" data-player-profile-close></div>
    <section class="intel-modal card" role="dialog" aria-modal="true" aria-labelledby="player-profile-title">
      <div class="intel-hero">
        <div class="intel-hero-copy">
          <div class="intel-kicker">Player profile${isAllied ? " • Ally" : ""}</div>
          <h2 id="player-profile-title" class="intel-title">${escapeHtml(playerName)}</h2>
          <p class="intel-summary">${relationshipLabel}${entry ? ` • Rank #${entry.rank}` : ""}</p>
          ${oathbreakerBadgeHtml}
        </div>
        <div class="intel-hero-sigil" aria-hidden="true">◈</div>
      </div>
      <div class="intel-stat-grid">
        ${statCardHtml("Score", entry ? entry.score.toFixed(0) : "?")}
        ${statCardHtml("Tiles", entry ? formatInt(entry.tiles) : "?")}
        ${statCardHtml("Income", entry ? `${(entry.incomePerMinute * 1440).toFixed(1)}/day` : "?")}
        ${statCardHtml("Techs", entry ? formatInt(entry.techs) : "?")}
      </div>
      ${truceStatusHtml}
      ${oathbreakerListHtml}
      ${!isSelf && oathbreakerBreaks.length === 0 ? `<p class="intel-summary" style="opacity:0.6">Truce-break history for other players isn't available yet.</p>` : ""}
      <div class="intel-actions">
        <button class="panel-btn intel-primary-btn" type="button" data-player-profile-close>Close</button>
      </div>
    </section>`;
};

// render + click wiring for the profile overlay, kept together here (rather
// than inline in client-hud.ts, which is already over the repo's 500-line
// file-size gate) since renderClientHud re-attaches these listeners on every
// re-render, same as its other overlay bindings.
export const renderPlayerProfileOverlay = (
  dom: Pick<ClientDom, "playerProfileOverlayEl">,
  state: Pick<ClientState, "activePlayerProfileId" | "leaderboard" | "allies" | "activeTruces" | "truceBreaksThisSeason">,
  playerNameForOwner: (ownerId?: string | null) => string
): void => {
  const profileId = state.activePlayerProfileId;
  dom.playerProfileOverlayEl.innerHTML = profileId
    ? playerProfileHtml({
        profilePlayerId: profileId,
        viewerPlayerId: selfPlayerIdFromLeaderboard(state.leaderboard) ?? "",
        playerName: playerNameForOwner(profileId) || profileId,
        leaderboardOverall: state.leaderboard.overall,
        allies: state.allies,
        activeTruces: state.activeTruces,
        truceBreaksThisSeason: state.truceBreaksThisSeason,
        nowMs: Date.now()
      })
    : "";
  dom.playerProfileOverlayEl.style.display = profileId ? "grid" : "none";
};

export const wirePlayerProfileOverlay = (
  dom: Pick<ClientDom, "hud" | "playerProfileOverlayEl">,
  state: Pick<ClientState, "activePlayerProfileId">,
  rerender: () => void
): void => {
  (dom.playerProfileOverlayEl.querySelectorAll("[data-player-profile-close]") as NodeListOf<HTMLElement>).forEach((btn) => {
    btn.onclick = () => {
      state.activePlayerProfileId = undefined;
      rerender();
    };
  });
  (dom.hud.querySelectorAll("[data-player-name-id]") as NodeListOf<HTMLElement>).forEach((el) => {
    el.onclick = () => {
      const playerId = el.dataset.playerNameId;
      if (!playerId) return;
      state.activePlayerProfileId = playerId;
      rerender();
    };
  });
};
