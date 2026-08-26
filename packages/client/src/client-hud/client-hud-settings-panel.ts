// Settings panel content: a hub of three focused sub-pages (Account,
// Gameplay, Diagnostics & Support) instead of one flat card. Pure HTML
// builders only — event binding stays in client-hud.ts alongside the rest of
// the HUD's bindings, following the same split used by
// client-audio-settings-ui.ts and client-hud-debug.ts.
import type { Auth } from "firebase/auth";
import { audioSettingsFieldHtml } from "../client-audio/client-audio-settings-ui.js";
import { DISCORD_INVITE_URL } from "../client-season-lobby-panel.js";
import { effectiveFogDisabled, mapRevealAvailable } from "../client-map-reveal/client-map-reveal.js";
import type { ClientState } from "../client-state/client-state.js";
import { authDebugHtml, authDebugSnapshot, type AuthDebugState } from "./client-hud-debug.js";

export type SettingsSubPage = NonNullable<ClientState["settingsSubPage"]>;

export type SettingsPanelState = AuthDebugState &
  Pick<ClientState, "authUserLabel" | "playerColors" | "mapRevealEligible" | "mapRevealEnabled" | "fogDisabled" | "settingsSubPage">;

// Moved out of renderClientHud's closure (was a nested function reading
// `state` from outer scope) so it can be composed here like every other
// settings card builder.
export const mapRevealCardHtml = (
  state: Pick<ClientState, "mapRevealEligible" | "authSessionReady" | "mapRevealEnabled" | "fogDisabled">
): string => {
  if (!mapRevealAvailable({ enabledForAccount: state.mapRevealEligible && state.authSessionReady })) return "";
  const buttonLabel = state.mapRevealEnabled ? "Restore Fog" : "Reveal Full Map";
  const statusLabel = effectiveFogDisabled(state) ? "Map reveal is on for this browser." : "Map reveal is off.";
  return `
    <div class="auth-map-reveal">
      <button type="button" class="panel-btn" data-map-reveal>${buttonLabel}</button>
      <p>${statusLabel}</p>
    </div>
  `;
};

const SETTINGS_NAV_ITEMS: Array<{ id: SettingsSubPage; title: string; desc: string }> = [
  { id: "account", title: "Account", desc: "Name and empire colour" },
  { id: "gameplay", title: "Gameplay", desc: "Ambient sound, map reveal, rally link" },
  { id: "diagnostics", title: "Diagnostics & Support", desc: "Connection status, downloads, report a bug" }
];

const SETTINGS_PAGE_TITLES: Record<SettingsSubPage, string> = {
  account: "Account",
  gameplay: "Gameplay",
  diagnostics: "Diagnostics & Support"
};

export const settingsHubHtml = (state: Pick<ClientState, "meName" | "authUserLabel" | "authReady">): string => `
  <div class="card auth-settings-card settings-hub">
    <p>Signed in as ${state.meName || state.authUserLabel || "Guest"}.</p>
    ${SETTINGS_NAV_ITEMS.map(
      (item) => `
      <button type="button" class="settings-nav-item" data-settings-nav="${item.id}">
        <span class="settings-nav-item-title">${item.title}</span>
        <span class="settings-nav-item-desc">${item.desc}</span>
      </button>`
    ).join("")}
    <a class="panel-btn discord-join-btn" href="${DISCORD_INVITE_URL}" target="_blank" rel="noopener noreferrer">
      <svg class="discord-join-btn-icon" viewBox="0 0 127.14 96.36" aria-hidden="true" focusable="false">
        <path fill="currentColor" d="M107.7,8.07A105.15,105.15,0,0,0,81.47,0a72.06,72.06,0,0,0-3.36,6.83A97.68,97.68,0,0,0,49,6.83,72.37,72.37,0,0,0,45.64,0,105.89,105.89,0,0,0,19.39,8.09C2.79,32.65-1.71,56.6.54,80.21h0A105.73,105.73,0,0,0,32.71,96.36,77.7,77.7,0,0,0,39.6,85.25a68.42,68.42,0,0,1-10.85-5.18c.91-.66,1.8-1.34,2.66-2a75.57,75.57,0,0,0,64.32,0c.87.71,1.76,1.39,2.66,2a68.68,68.68,0,0,1-10.87,5.19,77,77,0,0,0,6.89,11.1A105.25,105.25,0,0,0,126.6,80.22h0C129.24,52.84,122.09,29.11,107.7,8.07ZM42.45,65.69C36.18,65.69,31,60,31,53s5-12.74,11.43-12.74S54,46,53.89,53,48.84,65.69,42.45,65.69Zm42.24,0C78.41,65.69,73.25,60,73.25,53s5-12.74,11.44-12.74S96.23,46,96.12,53,91.08,65.69,84.69,65.69Z"/>
      </svg>
      <span>Join the Discord</span>
    </a>
    <button type="button" class="panel-btn" data-auth-logout ${state.authReady ? "" : "disabled"}>Log Out</button>
  </div>
`;

export const settingsAccountPageHtml = (
  state: Pick<ClientState, "meName" | "authUserLabel" | "me" | "playerColors" | "authSessionReady">
): string => {
  const color = state.playerColors.get(state.me) ?? "#38b000";
  return `
    <div class="card auth-settings-card">
      <p>Signed in as ${state.meName || state.authUserLabel || "Guest"}.</p>
      <div class="settings-account-summary">
        <span class="settings-account-swatch" style="--swatch: ${color}" aria-hidden="true"></span>
        <span>${state.meName || "Unnamed empire"}</span>
      </div>
      <button type="button" class="panel-btn" data-settings-edit-profile ${state.authSessionReady ? "" : "disabled"}>Edit Name &amp; Colour</button>
    </div>
  `;
};

export const rallyLinkCardHtml = (state: Pick<ClientState, "authSessionReady">): string => {
  if (!state.authSessionReady) return "";
  return `
    <div class="card auth-settings-card auth-rally-link">
      <button type="button" class="panel-btn" data-rally-link-open>Get Rally Link</button>
      <p>Invite your friends — a rally link drops them into the game right next to your starting location.</p>
    </div>
  `;
};

export const settingsGameplayPageHtml = (
  state: Pick<ClientState, "mapRevealEligible" | "authSessionReady" | "mapRevealEnabled" | "fogDisabled">
): string => {
  const mapRevealHtml = mapRevealCardHtml(state);
  return `
    <div class="card auth-settings-card">
      ${audioSettingsFieldHtml()}
    </div>
    ${rallyLinkCardHtml(state)}
    ${mapRevealHtml ? `<div class="card auth-settings-card">${mapRevealHtml}</div>` : ""}
  `;
};

export const settingsDiagnosticsPageHtml = (state: AuthDebugState, wsUrl: string, firebaseAuth: Auth | null | undefined): string => `
  <div class="card auth-settings-card">
    ${authDebugHtml(authDebugSnapshot(state, wsUrl, firebaseAuth))}
    <button type="button" class="panel-btn" data-settings-download-diagnostics>Download Diagnostics</button>
    <button type="button" class="panel-btn" data-settings-download-disconnect-history>Download Disconnect History</button>
    <button type="button" class="panel-btn" data-settings-report-bug>Report Bug</button>
    <button type="button" class="panel-btn suggest-improvement-btn" data-settings-suggest-improvement>Suggest Improvement</button>
  </div>
`;

export const settingsPanelHtml = (state: SettingsPanelState, wsUrl: string, firebaseAuth: Auth | null | undefined): string => {
  const subPage = state.settingsSubPage;
  if (!subPage) return settingsHubHtml(state);
  const content =
    subPage === "account"
      ? settingsAccountPageHtml(state)
      : subPage === "gameplay"
        ? settingsGameplayPageHtml(state)
        : settingsDiagnosticsPageHtml(state, wsUrl, firebaseAuth);
  return `
    <div class="settings-page-header">
      <button type="button" class="settings-back-btn" data-settings-back aria-label="Back to settings">‹ Back</button>
      <span class="settings-page-title">${SETTINGS_PAGE_TITLES[subPage]}</span>
    </div>
    ${content}
  `;
};
