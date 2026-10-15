// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hudMarkup } from "../client-dom-markup/client-dom-markup.js";
import { settingsAdminPageHtml } from "../client-hud/client-hud-settings-panel.js";

const here = dirname(fileURLToPath(import.meta.url));
const read = (relativePath: string): string => readFileSync(resolve(here, relativePath), "utf8");

const adminState = { mapRevealEligible: true, authSessionReady: true, mapRevealEnabled: false, fogDisabled: false, photoModeActive: false };

// The activity log isn't ready for players in its current form: its top-bar
// and mobile-nav buttons were removed and it now opens only from
// Settings > Admin.
describe("activity log is admin-only", () => {
  it("has no Activity button in the player HUD (desktop top bar or mobile nav)", () => {
    expect(hudMarkup).not.toContain("data-open-activity-dashboard");
  });

  it("is opened from Settings > Admin, and only there", () => {
    expect(settingsAdminPageHtml(adminState)).toContain('data-open-activity-dashboard="admin"');
    expect(settingsAdminPageHtml({ ...adminState, mapRevealEligible: false })).not.toContain("data-open-activity-dashboard");
  });

  it("wires the open button after the Settings panel renders, without overwriting its label", () => {
    const hud = read("../client-hud/client-hud.ts");
    const settingsRender = hud.indexOf("dom.panelSettingsEl.innerHTML = settingsPanelHtml(state, wsUrl, firebaseAuth);");
    const wiring = hud.indexOf('dom.hud.querySelectorAll("[data-open-activity-dashboard]")');
    expect(settingsRender).toBeGreaterThan(-1);
    expect(wiring).toBeGreaterThan(settingsRender);
    expect(hud).toContain('if (btn.dataset.openActivityDashboard !== "admin") setTabButtonHtml(btn');
  });

  it("only fetches activity at login for admin accounts", () => {
    expect(read("../client-network/client-network.ts")).toContain("if (isFirstInitThisSession && state.mapRevealEligible) requestPersonalActivity(");
  });
});
