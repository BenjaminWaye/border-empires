// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { hudMarkup } from "../client-dom-markup/client-dom-markup.js";
import { settingsAdminPageHtml } from "./client-hud-settings-panel.js";
import { bindAdminSettingsControls } from "./client-hud-admin-settings.js";

const adminState = { mapRevealEligible: true, authSessionReady: true, mapRevealEnabled: false, fogDisabled: false };

// The Alerts feed (bell) isn't ready for players in its current form: its
// top-bar and mobile-nav buttons were removed and it opens only from
// Settings > Admin. The Activity (world pulse) dashboard button stays.
describe("alerts feed is admin-only", () => {
  it("has no Alerts bell in the player HUD, but keeps the Activity dashboard button", () => {
    expect(hudMarkup).not.toContain('data-panel="feed"');
    expect(hudMarkup).not.toContain('data-mobile-panel="feed"');
    expect(hudMarkup).toContain("data-open-activity-dashboard");
    expect(hudMarkup).toContain('id="panel-feed"');
  });

  it("opens the alerts feed from Settings > Admin, and only for admins", () => {
    const root = document.createElement("div");
    root.innerHTML = settingsAdminPageHtml(adminState);
    const openPanel = vi.fn();
    bindAdminSettingsControls(root, {
      state: { ...adminState, authEmail: null, connection: "connected" } as never,
      sendGameMessage: vi.fn(() => true),
      requestViewRefresh: vi.fn(),
      rerender: vi.fn(),
      openPanel
    });
    root.querySelector<HTMLButtonElement>("[data-admin-open-alerts-feed]")?.click();
    expect(openPanel).toHaveBeenCalledWith("feed");
    expect(settingsAdminPageHtml({ ...adminState, mapRevealEligible: false })).not.toContain("data-admin-open-alerts-feed");
  });
});
