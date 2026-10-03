import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// These guards used to live in client-domain-html/client-domain-panel-regression.test.ts
// (piggybacking on that file's source-grepping helper) but are about the
// Settings panel, not domains. Relocated here as part of the settings
// hub/sub-pages redesign — file targets updated to match, behavior unchanged.
const sourceFor = (name: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, name), "utf8");
};

describe("settings panel regression guard", () => {
  it("shows the client build version in the merged diagnostics card", () => {
    // The connection-status and account/auth debug cards were merged into
    // one, so the build version now lives in client-hud-debug.ts's combined
    // card instead of a standalone line in client-hud-settings-panel.ts.
    const hudDebugSource = sourceFor("./client-hud-debug.ts");

    expect(hudDebugSource).toContain("clientBuildShortLabel");
    expect(hudDebugSource).toContain("`Client build ${CLIENT_BUILD_VERSION}`");
  });

  it("merges connection status and account debug info into one card with a single Copy button", () => {
    const hudSource = sourceFor("./client-hud.ts");
    const hudDebugSource = sourceFor("./client-hud-debug.ts");
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");

    expect(hudDebugSource).not.toContain("bridgeStatusHtml");
    expect(hudDebugSource).not.toContain("data-copy-bridge-debug");
    expect(settingsPanelSource).not.toContain("bridgeStatusHtml");
    expect(hudSource).not.toContain("data-copy-bridge-debug");
    expect(hudSource).not.toContain("bridgeDebugCopyButtons");

    expect(hudDebugSource).toContain("export const authDebugHtml = (details: AuthDebugSnapshot): string => {");
    expect(hudDebugSource).toContain("Render FPS");
    expect(hudDebugSource).toContain("data-fps-readout");
    expect(hudDebugSource).toContain("data-zoom-readout");
    expect(hudDebugSource).toContain("data-copy-auth-debug");
    expect(hudDebugSource).toContain("Copy Debug Info");
    expect(hudDebugSource).toContain("details.authUid");
    expect(hudDebugSource).toContain("details.playerId");
    expect(hudDebugSource).toContain("details.backendLabel");
    expect(hudDebugSource).toContain("details.serverBuildLabel");
    expect(hudDebugSource).toContain("export const authDebugCopyPayload = (");
    expect(hudDebugSource).toContain("export const bindAuthDebugCopyButton = (");
    expect(hudDebugSource).toContain("navigator.clipboard.writeText(");
    expect(hudSource).toContain("bindAuthDebugCopyButton(dom.hud, { state, wsUrl, firebaseAuth, pushFeed, onCopied: () => renderClientHud(deps) })");
  });

  it("binds every rendered logout button instead of only the first duplicated settings card control", () => {
    const hudSource = sourceFor("./client-hud.ts");

    expect(hudSource).toContain("data-auth-logout");
    expect(hudSource).toContain("const authLogoutButtons = dom.hud.querySelectorAll(\"[data-auth-logout]\")");
    expect(hudSource).toContain("authLogoutButtons.forEach((authLogoutBtn: HTMLButtonElement) => {");
    expect(hudSource).not.toContain("document.querySelector(\"#auth-logout\")");
    expect(hudSource).not.toContain("id=\"auth-logout\"");
  });

  it("puts Log Out on the settings hub, not inside the Account sub-page", () => {
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");

    const hubStart = settingsPanelSource.indexOf("export const settingsHubHtml");
    const hubEnd = settingsPanelSource.indexOf("export const settingsAccountPageHtml");
    const accountStart = hubEnd;
    const accountEnd = settingsPanelSource.indexOf("export const settingsGameplayPageHtml");

    expect(settingsPanelSource.slice(hubStart, hubEnd)).toContain("data-auth-logout");
    expect(settingsPanelSource.slice(accountStart, accountEnd)).not.toContain("data-auth-logout");
  });

  it("keeps the map reveal button reachable from the admin page", () => {
    const hudSource = sourceFor("./client-hud.ts");
    const adminBindingsSource = sourceFor("./client-hud-admin-settings.ts");
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");

    const gameplayStart = settingsPanelSource.indexOf("export const settingsGameplayPageHtml");
    const adminStart = settingsPanelSource.indexOf("export const settingsAdminPageHtml");
    expect(settingsPanelSource.slice(gameplayStart, adminStart)).not.toContain("mapRevealCardHtml");
    expect(settingsPanelSource.slice(adminStart)).toContain("mapRevealCardHtml(state)");
    expect(settingsPanelSource).toContain("lightingTunerCardHtml()");
    expect(settingsPanelSource).toContain("data-map-reveal");
    expect(settingsPanelSource).toContain("Reveal Full Map");
    expect(settingsPanelSource).toContain("Restore Fog");
    expect(hudSource).toContain("bindAdminSettingsControls(dom.hud,");
    expect(adminBindingsSource).toContain("[data-map-reveal]");
    expect(adminBindingsSource).toContain('type: "REQUEST_REVEAL_MAP"');
    expect(adminBindingsSource).toContain('type: "SET_FOG_DISABLED"');
  });

  it("puts the Photo Mode toggle in the same card as map reveal, gated the same way", () => {
    const hudSource = sourceFor("./client-hud.ts");
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");
    const photoModeSource = sourceFor("../client-photo-mode/client-photo-mode.ts");

    const revealCardStart = settingsPanelSource.indexOf("export const mapRevealCardHtml");
    const revealCardEnd = settingsPanelSource.indexOf("const SETTINGS_NAV_ITEMS");
    const revealCardBody = settingsPanelSource.slice(revealCardStart, revealCardEnd);

    expect(revealCardBody).toContain("data-photo-mode-toggle");
    expect(revealCardBody).toContain("Enter Photo Mode");
    expect(revealCardBody).toContain("Exit Photo Mode");
    // Same fog-admin availability check as the reveal button in this card, not a separate/looser gate.
    expect(revealCardBody).toContain("if (!mapRevealAvailable(");

    expect(hudSource).toContain("bindPhotoModeSettingsControls(dom.hud, state, () => renderClientHud(deps))");
    expect(photoModeSource).toContain("export const bindPhotoModeSettingsControls =");
    expect(photoModeSource).toContain("mapRevealAvailable({ enabledForAccount: state.mapRevealEligible && state.authSessionReady })");
  });

  it("opens the rally link panel in place instead of a full page navigation", () => {
    // Regression: "Get Rally Link" used to be a plain <a href="/rally/new">,
    // which forced a full page reload and re-raced Firebase Auth rehydration
    // -- already-signed-in players briefly saw "Sign in, then this page will
    // create your rally link." It must stay a button bound (via a delegated
    // click listener in client-rally-links.ts) to open the panel in-page,
    // not a navigating anchor.
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");
    const rallyLinksSource = sourceFor("../client-rally-links/client-rally-links.ts");

    expect(settingsPanelSource).not.toContain('href="/rally/new"');
    expect(settingsPanelSource).toContain("data-rally-link-open");
    expect(rallyLinksSource).toContain("bindRallyLinkOpenClicks");
    expect(rallyLinksSource).toContain('"[data-rally-link-open]"');
  });

  it("adds a notifications sub-page wired the same way as the other settings sub-pages", () => {
    const settingsPanelSource = sourceFor("./client-hud-settings-panel.ts");
    const hudSource = sourceFor("./client-hud.ts");

    expect(settingsPanelSource).toContain('{ id: "notifications", title: "Email Notifications"');
    expect(settingsPanelSource).toContain("notifications: \"Email Notifications\"");
    expect(settingsPanelSource).toContain("settingsNotificationsPageHtml()");
    expect(hudSource).toContain("bindEmailNotificationsSettingsControls(dom.hud)");
  });
});
