import { selfPlayerIdFromLeaderboard } from "../client-panel-html/client-panel-html.js";

// Top-toolbar "Player" chip. When our player id is known it is a button
// carrying data-player-name-id, which wirePlayerProfileOverlay wires to open
// the profile screen (same hook the leaderboard names use).
export const selfPlayerChipHtml = (connClass: string, meName: string, leaderboard: Parameters<typeof selfPlayerIdFromLeaderboard>[0]): string => {
  const selfPlayerId = selfPlayerIdFromLeaderboard(leaderboard);
  const name = meName || "Player";
  if (!selfPlayerId) return `<div class="stat-chip stat-chip-player ${connClass}"><span>Player</span><strong>${name}</strong></div>`;
  const idAttr = selfPlayerId.replace(/[&<>"']/g, "");
  return `<button class="stat-chip stat-chip-player ${connClass}" type="button" data-player-name-id="${idAttr}" title="Open your profile"><span>Player</span><strong>${name}</strong></button>`;
};

export const integrityWarningTipHtml = (show: boolean): string =>
  show
    ? `<div class="integrity-warning-tip" role="alert">
        <button class="integrity-warning-tip-close" type="button" data-dismiss-integrity-warning="x" aria-label="Dismiss">&times;</button>
        <p>Empire Integrity is below 90% — exposed borders are cutting into your income and growth bonus.</p>
        <button class="integrity-warning-tip-ack" type="button" data-dismiss-integrity-warning="ok">I understand</button>
      </div>`
    : "";
