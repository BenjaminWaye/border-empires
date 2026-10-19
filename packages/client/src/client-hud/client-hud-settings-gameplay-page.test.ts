import { DEFAULT_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { loadedAutoSettleState } from "../client-auto-settle-prompt/client-auto-settle-prefs.js";
import { settingsGameplayPageHtml } from "./client-hud-settings-panel.js";

const gameplayState = {
  authSessionReady: true,
  authEmail: "ada@example.com",
  autoSettle: loadedAutoSettleState({ ...DEFAULT_AUTO_SETTLE_PREFS, towns: true, food: false, resources: false }),
  photoModeActive: false
};

describe("Settings > Gameplay", () => {
  it("no longer offers the Siege Tower Aim dropdown", () => {
    const html = settingsGameplayPageHtml(gameplayState);
    expect(html).not.toContain("data-siege-tower-rotation-mode");
    expect(html).not.toContain("Siege Tower Aim");
    expect(html).not.toContain("<select");
  });

  it("uses the custom toggle and slider for every checkbox and range", () => {
    const html = settingsGameplayPageHtml(gameplayState);
    const checkboxes = html.match(/<input type="checkbox"[^>]*>/g) ?? [];
    const ranges = html.match(/<input type="range"[^>]*>/g) ?? [];
    expect(checkboxes.length).toBeGreaterThanOrEqual(5); // music, hints, 3 auto-garrison categories
    for (const box of checkboxes) expect(box).toContain('class="settings-toggle-input"');
    expect(ranges).toHaveLength(1);
    expect(ranges[0]).toContain('class="settings-slider"');
    expect(html).toContain('data-settings-auto-settle="towns" checked');
  });

  it("offers Enter Photo Mode with the Ctrl+P shortcut, and Exit once active", () => {
    expect(settingsGameplayPageHtml(gameplayState)).toContain("data-photo-mode-toggle>Enter Photo Mode");
    expect(settingsGameplayPageHtml(gameplayState)).toContain("<kbd>Ctrl</kbd>+<kbd>P</kbd>");
    expect(settingsGameplayPageHtml({ ...gameplayState, photoModeActive: true })).toContain("Exit Photo Mode");
  });
});
