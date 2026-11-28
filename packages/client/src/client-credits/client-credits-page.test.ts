import { describe, expect, it } from "vitest";
import { settingsPanelHtml, settingsHubHtml } from "../client-hud/client-hud-settings-panel.js";
import { createInitialState } from "../client-state/client-state.js";

describe("Settings credits", () => {
  // Playtest Run 4: a persona wanted to know who makes the game and found nothing.
  // First-15 round 1 (2026-11-28): the creator was not named, and the studio was misspelt "Wayepoint".
  it("lists Credits in the settings hub and names the creator and the studio on its page", () => {
    const state = createInitialState();
    expect(settingsHubHtml(state)).toContain('data-settings-nav="credits"');
    state.settingsSubPage = "credits";
    const html = settingsPanelHtml(state, "wss://example.test", null);
    expect(html).toContain("Created by Benjamin Waye.");
    expect(html).toContain("Made by Waypoint Studios.");
    expect(html).not.toContain("Wayepoint");
    expect(html).toContain('<span class="settings-page-title">Credits</span>');
  });
});
