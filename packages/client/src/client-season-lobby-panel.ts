// Renders the "waiting room" content of the join-season overlay (see
// client-join-season-overlay.ts): live player count, roster of who's checked
// in, Discord link, and an invite/share button. Split out of the overlay
// module to keep that file under the repo's line cap.
import type { ClientState } from "./client-state/client-state.js";
import type { FeedType, FeedSeverity } from "./client-types.js";
import { foundingEngineerNameHtml } from "./client-founding-engineer/client-founding-engineer.js";

export const DISCORD_INVITE_URL = "https://discord.gg/KaKSnaH5T";
// Lightweight utm param, not a tracked referral system -- just distinguishes
// share-button traffic in analytics if anyone looks.
export const GAME_SHARE_URL = "https://play.borderempires.com?utm_source=share";

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const rosterRowHtml = (entry: { playerId: string; name: string }): string =>
  `<li class="season-lobby-roster-row">${foundingEngineerNameHtml(escapeHtml(entry.name), entry.name)}</li>`;

// `joined` distinguishes the two callers: the pending-season countdown
// branch (player already has a spot reserved, waiting for the world to
// start) shows the "You're in" confirmation, while the plain "join now"
// branch (season already active, player hasn't clicked join yet) shows the
// count/roster for context without claiming a spot it hasn't reserved.
export const renderSeasonLobbyPanelHtml = (
  state: Pick<ClientState, "seasonLobbyWaitingCount" | "seasonLobbyMaxPlayers" | "seasonLobbyRoster">,
  joined = true
): string => {
  const { seasonLobbyWaitingCount, seasonLobbyMaxPlayers, seasonLobbyRoster } = state;
  const countLabel = seasonLobbyMaxPlayers > 0 ? `${seasonLobbyWaitingCount} / ${seasonLobbyMaxPlayers} PLAYERS` : `${seasonLobbyWaitingCount} PLAYERS WAITING`;
  const rosterHtml = seasonLobbyRoster.length > 0
    ? `<ul class="season-lobby-roster">${seasonLobbyRoster.map(rosterRowHtml).join("")}</ul>`
    : `<p class="season-lobby-roster-empty">You're the first one here.</p>`;
  const confirmedHtml = joined
    ? `<div class="season-lobby-confirmed">🟢 You're in. Your empire will be placed when the world begins.</div>`
    : "";
  return `
    <section class="respawn-section season-lobby-panel">
      <div class="season-lobby-count">${countLabel}</div>
      ${confirmedHtml}
      <div class="season-lobby-roster-scroll">${rosterHtml}</div>
      <div class="season-lobby-actions">
        <a class="panel-btn" id="season-lobby-discord" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener noreferrer">Join the Discord</a>
        <button class="panel-btn" id="season-lobby-invite" type="button">Bring a friend →</button>
        <span class="season-lobby-invite-status" id="season-lobby-invite-status" aria-live="polite"></span>
      </div>
    </section>
  `;
};

export type SeasonLobbyPanelDeps = {
  overlayEl: HTMLElement;
  pushFeed?: ((message: string, type: FeedType, severity?: FeedSeverity) => void) | undefined;
};

// Copies GAME_SHARE_URL to the clipboard for the invite button (a plain
// share link, not a referral-tracking system). Feedback is shown inline in
// the lobby panel itself -- the HUD feed toast this used to rely on lives
// outside #join-season-overlay and is hidden while the lobby is full-screen,
// so a pushFeed-only outcome was invisible to the player. `navigator.clipboard`
// is also unavailable in some contexts (e.g. non-secure origins), in which
// case the optional-chained writeText used to silently no-op -- this falls
// back to a hidden textarea + document.execCommand("copy"), and if even that
// throws/fails, shows the link so the player can copy it manually.
export const bindSeasonLobbyPanel = (deps: SeasonLobbyPanelDeps): void => {
  const { overlayEl } = deps;
  const inviteBtn = overlayEl.querySelector("#season-lobby-invite") as HTMLButtonElement | null;
  const statusEl = overlayEl.querySelector("#season-lobby-invite-status") as HTMLElement | null;
  if (!inviteBtn) return;

  const defaultLabel = inviteBtn.textContent ?? "Bring a friend →";
  let resetTimer: ReturnType<typeof setTimeout> | undefined;
  const showOutcome = (label: string, status: string): void => {
    inviteBtn.textContent = label;
    if (statusEl) statusEl.textContent = status;
    if (resetTimer) clearTimeout(resetTimer);
    resetTimer = setTimeout(() => {
      inviteBtn.textContent = defaultLabel;
      if (statusEl) statusEl.textContent = "";
    }, 2_500);
  };

  const legacyCopy = (): boolean => {
    if (typeof document.execCommand !== "function") return false;
    const textarea = document.createElement("textarea");
    textarea.value = GAME_SHARE_URL;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    let copied = false;
    try {
      copied = document.execCommand("copy");
    } catch {
      copied = false;
    }
    document.body.removeChild(textarea);
    return copied;
  };

  inviteBtn.onclick = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(GAME_SHARE_URL).then(
        () => showOutcome("Copied!", "Invite link copied to clipboard."),
        () => {
          if (legacyCopy()) {
            showOutcome("Copied!", "Invite link copied to clipboard.");
          } else {
            showOutcome("Copy failed", `Copy manually: ${GAME_SHARE_URL}`);
          }
        }
      );
      return;
    }
    if (legacyCopy()) {
      showOutcome("Copied!", "Invite link copied to clipboard.");
    } else {
      showOutcome("Copy failed", `Copy manually: ${GAME_SHARE_URL}`);
    }
  };
};
