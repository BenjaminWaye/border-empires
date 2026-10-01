import { describe, expect, it } from "vitest";
import { settingsAdminPageHtml, settingsHubHtml } from "./client-hud-settings-panel.js";

const hubState = { meName: "Ada", authUserLabel: "ada", authReady: true, authSessionReady: true, mapRevealEligible: false };
const adminCardState = { authSessionReady: true, mapRevealEnabled: false, fogDisabled: false, photoModeActive: false };

describe("Settings > Admin", () => {
  it("is only listed on the hub for fog-admin accounts", () => {
    expect(settingsHubHtml(hubState)).not.toContain('data-settings-nav="admin"');
    expect(settingsHubHtml({ ...hubState, mapRevealEligible: true })).toContain('data-settings-nav="admin"');
  });

  it("shows map reveal, photo mode and the lighting tuner to admins", () => {
    const html = settingsAdminPageHtml({ ...adminCardState, mapRevealEligible: true });
    expect(html).toContain("data-map-reveal");
    expect(html).toContain("data-photo-mode-toggle");
    expect(html).toContain('data-lighting-number="sunIntensity"');
    expect(html).toContain('data-lighting-color="sunColor"');
    expect(html).toContain("data-lighting-reset");
  });

  it("renders no controls for a non-admin who somehow lands on the page", () => {
    const html = settingsAdminPageHtml({ ...adminCardState, mapRevealEligible: false });
    expect(html).not.toContain("data-map-reveal");
    expect(html).not.toContain("data-lighting-number");
  });
});
