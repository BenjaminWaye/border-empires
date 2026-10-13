import { INTEGRITY_PENALTY_PCT } from "@border-empires/shared";
import { selfPlayerIdFromLeaderboard } from "../client-panel-html/client-panel-html.js";

// Top-toolbar "Player" chip. When our player id is known it is a button
// carrying data-player-name-id, which wirePlayerProfileOverlay wires to open
// the profile screen (same hook the leaderboard names use).
export const selfPlayerChipHtml = (connClass: string, meName: string, leaderboard: Parameters<typeof selfPlayerIdFromLeaderboard>[0]): string => {
  const selfPlayerId = selfPlayerIdFromLeaderboard(leaderboard);
  const name = meName || "Player";
  if (!selfPlayerId) return `<div class="stat-chip stat-chip-player ${connClass}"><span>Player</span><strong>${name}</strong></div>`;
  const idAttr = selfPlayerId.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  return `<button class="stat-chip stat-chip-player ${connClass}" type="button" data-player-name-id="${idAttr}" title="Open your profile"><span>Player</span><strong>${name}</strong></button>`;
};

export const integrityWarningTipHtml = (show: boolean): string =>
  show
    ? `<div class="integrity-warning-tip" role="alert">
        <button class="integrity-warning-tip-close" type="button" data-dismiss-integrity-warning="x" aria-label="Dismiss">&times;</button>
        <p><strong>Integrity below ${INTEGRITY_PENALTY_PCT}%</strong><br />Less Coin &middot; Growth</p>
        <button class="integrity-warning-tip-ack" type="button" data-defensibility-open="true">More info</button>
        <button class="integrity-warning-tip-ack" type="button" data-dismiss-integrity-warning="ok">Got it</button>
      </div>`
    : "";

// Empire Integrity lives in the Economy panel (its summary card opens the
// breakdown). The top-bar chip only appears once integrity actually costs
// coin/growth -- below INTEGRITY_PENALTY_PCT -- so new players aren't shown a
// falling number while it is still a bonus.
export const integrityChipHtml = (args: { pct: number; defClass: string; showWarning: boolean; mobile: boolean }): string =>
  args.pct >= INTEGRITY_PENALTY_PCT
    ? ""
    : `<div class="stat-chip-def-wrap">
      <button class="stat-chip stat-chip-def${args.defClass}${args.showWarning ? " warning" : ""}" type="button" data-defensibility-open="true" title="Compact empires with fewer exposed sides earn an income and growth bonus. Tap for a breakdown."><span>${args.mobile ? "Integrity" : "Empire Integrity"}</span><strong>${Math.round(args.pct)}%</strong></button>
      ${integrityWarningTipHtml(args.showWarning)}
    </div>`;
