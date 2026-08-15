import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// state.authUserLabel is only ever set from the Firebase auth user at login
// (client-auth-flow.ts) and is never refreshed by a display-name change (that
// flow only updates state.meName, via PLAYER_STYLE/PLAYER_UPDATE). Settings'
// "Signed in as" line must therefore prefer meName so it reflects a
// successful in-game display name change instead of staying stuck on the
// name captured at login.
describe("client HUD Settings 'Signed in as' regression", () => {
  it("prefers the live in-game display name over the stale login-time auth label", () => {
    // Moved out of client-hud.ts into the settings hub/sub-page builders as
    // part of the settings redesign; the line is duplicated on both (the hub
    // and the Account page still greet the player by name).
    const settingsPanelSource = readFileSync(new URL("./client-hud-settings-panel.ts", import.meta.url), "utf8");

    const occurrences = settingsPanelSource.split("Signed in as ${state.meName || state.authUserLabel || \"Guest\"}.").length - 1;
    expect(occurrences).toBeGreaterThanOrEqual(1);
  });
});
