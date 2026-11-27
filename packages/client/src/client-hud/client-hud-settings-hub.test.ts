import { describe, expect, it, vi } from "vitest";

vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => false } }));

import { settingsAccountPageHtml, settingsHubHtml } from "./client-hud-settings-panel.js";

const hubState = { meName: "Ada", authUserLabel: "ada", authReady: true, authSessionReady: true, mapRevealEligible: false, authIsGuest: false };

describe("Settings hub", () => {
  // Regression: a guest read "Signed in as House Noname 40" with nothing saying Log Out would lose the empire.
  it("tells a guest their progress isn't saved and offers to save it", () => {
    const html = settingsHubHtml({ ...hubState, authIsGuest: true });
    expect(html).toContain("<strong>Guest</strong>");
    expect(html).toContain("data-settings-guest-save");
    expect(html).not.toContain("Signed in as");
  });

  it("keeps the plain signed-in line for a saved account", () => {
    const html = settingsHubHtml(hubState);
    expect(html).toContain("Signed in as Ada.");
    expect(html).not.toContain("data-settings-guest-save");
  });

  // Regression: invites were buried on the Gameplay page between sound and the renderer.
  it("offers Invite friends on the hub once a session exists", () => {
    expect(settingsHubHtml(hubState)).toContain("data-rally-link-open");
    expect(settingsHubHtml({ ...hubState, authSessionReady: false })).not.toContain("data-rally-link-open");
  });

  it("keeps Log Out last, in its own footer", () => {
    const html = settingsHubHtml(hubState);
    const footer = html.indexOf("settings-hub-footer");
    expect(footer).toBeGreaterThan(html.indexOf("data-settings-nav"));
    expect(footer).toBeGreaterThan(html.indexOf("discord-join-btn"));
    expect(html.indexOf("data-auth-logout")).toBeGreaterThan(footer);
  });
});

describe("Settings > Account", () => {
  // Regression: Delete account sat directly under Edit Name with the same styling.
  it("puts Delete account in a separate danger card after everything else", () => {
    const html = settingsAccountPageHtml({
      meName: "Ada", authUserLabel: "", me: "p1", playerColors: new Map(), authSessionReady: true, playerCosmetics: new Map(), ownedCosmetics: []
    } as unknown as Parameters<typeof settingsAccountPageHtml>[0]);
    const danger = html.indexOf("settings-danger-zone");
    expect(danger).toBeGreaterThan(html.indexOf("data-settings-edit-profile"));
    expect(html.indexOf("data-account-delete")).toBeGreaterThan(danger);
    expect(html).toContain("settings-danger-btn");
  });
});
