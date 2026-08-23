// Settings panel content: a hub of three focused sub-pages (Account,
// Gameplay, Diagnostics & Support) instead of one flat card. Pure HTML
// builders only — event binding stays in client-hud.ts alongside the rest of
// the HUD's bindings, following the same split used by
// client-audio-settings-ui.ts and client-hud-debug.ts.
import type { Auth } from "firebase/auth";
import { audioSettingsFieldHtml } from "../client-audio/client-audio-settings-ui.js";
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
    <div class="auth-rally-link">
      <a class="panel-btn" href="/rally/new">Get Rally Link</a>
      <p>Invite others to a rally point on the map.</p>
    </div>
  `;
};

export const settingsGameplayPageHtml = (
  state: Pick<ClientState, "mapRevealEligible" | "authSessionReady" | "mapRevealEnabled" | "fogDisabled">
): string => `
  <div class="card auth-settings-card">
    ${audioSettingsFieldHtml()}
    ${mapRevealCardHtml(state)}
    ${rallyLinkCardHtml(state)}
  </div>
`;

export const settingsDiagnosticsPageHtml = (state: AuthDebugState, wsUrl: string, firebaseAuth: Auth | null | undefined): string => `
  <div class="card auth-settings-card">
    ${authDebugHtml(authDebugSnapshot(state, wsUrl, firebaseAuth))}
    <button type="button" class="panel-btn" data-settings-download-diagnostics>Download Diagnostics</button>
    <button type="button" class="panel-btn" data-settings-download-disconnect-history>Download Disconnect History</button>
    <button type="button" class="panel-btn" data-settings-report-bug>Report Bug</button>
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
