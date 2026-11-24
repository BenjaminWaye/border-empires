import { describe, expect, it } from "vitest";
import { settingsPanelHtml, settingsHubHtml } from "../client-hud/client-hud-settings-panel.js";
import { createInitialState } from "../client-state/client-state.js";

describe("Settings credits", () => {
  // Playtest Run 4: a persona wanted to know who makes the game and found nothing.
  it("lists Credits in the settings hub and names the studio on its page", () => {
    const state = createInitialState();
    expect(settingsHubHtml(state)).toContain('data-settings-nav="credits"');
    state.settingsSubPage = "credits";
    const html = settingsPanelHtml(state, "wss://example.test", null);
    expect(html).toContain("Made by Wayepoint Studios.");
    expect(html).toContain('<span class="settings-page-title">Credits</span>');
  });
});
