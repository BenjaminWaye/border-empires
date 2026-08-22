// Renders the "waiting room" content of the pending-season overlay (see
// client-join-season-overlay.ts): live player count, roster of who's
// checked in, Discord link, an invite/share button, and (if the player
// hasn't set one yet) an inline country-flag picker prompt. Split out of the
// overlay module to keep that file under the repo's line cap.
import type { ClientState } from "./client-state/client-state.js";
import type { FeedType, FeedSeverity } from "./client-types.js";

export const DISCORD_INVITE_URL = "https://discord.gg/KaKSnaH5T";
// Lightweight utm param, not a tracked referral system -- just distinguishes
// share-button traffic in analytics if anyone looks.
export const GAME_SHARE_URL = "https://play.borderempires.com?utm_source=share";

// A small curated list of common ISO 3166-1 alpha-2 codes for the flag
// picker -- not exhaustive, just enough that most beta testers find their
// country. Regional indicator symbols turn any 2-letter code into a flag
// emoji, so this list is only for the <select> options, not a validation
// allowlist (the gateway accepts any 2 uppercase letters).
export const COMMON_COUNTRY_CODES: readonly [code: string, label: string][] = [
  ["US", "United States"], ["GB", "United Kingdom"], ["CA", "Canada"], ["AU", "Australia"],
  ["DE", "Germany"], ["FR", "France"], ["ES", "Spain"], ["IT", "Italy"], ["NL", "Netherlands"],
  ["SE", "Sweden"], ["NO", "Norway"], ["FI", "Finland"], ["DK", "Denmark"], ["PL", "Poland"],
  ["BR", "Brazil"], ["MX", "Mexico"], ["AR", "Argentina"], ["JP", "Japan"], ["KR", "South Korea"],
  ["CN", "China"], ["IN", "India"], ["SG", "Singapore"], ["PH", "Philippines"], ["ID", "Indonesia"],
  ["ZA", "South Africa"], ["NG", "Nigeria"], ["EG", "Egypt"], ["TR", "Turkey"], ["RU", "Russia"],
  ["UA", "Ukraine"], ["IE", "Ireland"], ["PT", "Portugal"], ["NZ", "New Zealand"]
];

export const flagEmoji = (countryCode: string): string => {
  const code = countryCode.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "";
  const REGIONAL_INDICATOR_A = 0x1f1e6;
  return String.fromCodePoint(...[...code].map((ch) => REGIONAL_INDICATOR_A + (ch.charCodeAt(0) - 65)));
};

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

const rosterRowHtml = (entry: { playerId: string; name: string; countryFlag?: string }): string => {
  const flag = entry.countryFlag ? `${flagEmoji(entry.countryFlag)} ` : "";
  return `<li class="season-lobby-roster-row">${flag}${escapeHtml(entry.name)}</li>`;
};

const flagPickerHtml = (): string => {
  const options = COMMON_COUNTRY_CODES.map(([code, label]) => `<option value="${code}">${flagEmoji(code)} ${escapeHtml(label)}</option>`).join("");
  return `
    <div class="season-lobby-flag-picker">
      <label for="season-lobby-flag-select">Show your flag in the lobby? (optional)</label>
      <select id="season-lobby-flag-select">
        <option value="">No flag</option>
        ${options}
      </select>
    </div>
  `;
};

export const renderSeasonLobbyPanelHtml = (
  state: Pick<ClientState, "seasonLobbyWaitingCount" | "seasonLobbyMaxPlayers" | "seasonLobbyRoster" | "myCountryFlag">
): string => {
  const { seasonLobbyWaitingCount, seasonLobbyMaxPlayers, seasonLobbyRoster, myCountryFlag } = state;
  const countLabel = seasonLobbyMaxPlayers > 0 ? `${seasonLobbyWaitingCount} / ${seasonLobbyMaxPlayers} PLAYERS` : `${seasonLobbyWaitingCount} PLAYERS WAITING`;
  const rosterHtml = seasonLobbyRoster.length > 0
    ? `<ul class="season-lobby-roster">${seasonLobbyRoster.map(rosterRowHtml).join("")}</ul>`
    : `<p class="season-lobby-roster-empty">You're the first one here.</p>`;
  return `
    <section class="respawn-section season-lobby-panel">
      <div class="season-lobby-count">${countLabel}</div>
      <div class="season-lobby-confirmed">🟢 You're in. Your empire will be placed when the world begins.</div>
      <div class="season-lobby-roster-scroll">${rosterHtml}</div>
      ${myCountryFlag ? "" : flagPickerHtml()}
      <div class="season-lobby-actions">
        <a class="panel-btn" id="season-lobby-discord" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener noreferrer">Join the Discord</a>
        <button class="panel-btn" id="season-lobby-invite" type="button">Bring a friend →</button>
      </div>
    </section>
  `;
};

export type SeasonLobbyPanelDeps = {
  overlayEl: HTMLElement;
  state: Pick<ClientState, "myCountryFlag">;
  setCountryFlag: (countryFlag: string) => boolean;
  pushFeed?: ((message: string, type: FeedType, severity?: FeedSeverity) => void) | undefined;
};

// Wires the flag picker + invite/share button once the panel HTML above is
// in the DOM. Copies GAME_SHARE_URL to the clipboard for the invite button
// (a plain share link, not a referral-tracking system).
export const bindSeasonLobbyPanel = (deps: SeasonLobbyPanelDeps): void => {
  const { overlayEl, setCountryFlag, pushFeed } = deps;
  const flagSelect = overlayEl.querySelector("#season-lobby-flag-select") as HTMLSelectElement | null;
  if (flagSelect) {
    flagSelect.onchange = () => {
      const code = flagSelect.value;
      if (code) setCountryFlag(code);
    };
  }
  const inviteBtn = overlayEl.querySelector("#season-lobby-invite") as HTMLButtonElement | null;
  if (inviteBtn) {
    inviteBtn.onclick = () => {
      navigator.clipboard?.writeText(GAME_SHARE_URL).then(
        () => pushFeed?.("Invite link copied to clipboard.", "info"),
        () => pushFeed?.("Could not copy the invite link -- copy it manually: " + GAME_SHARE_URL, "error")
      );
    };
  }
};
