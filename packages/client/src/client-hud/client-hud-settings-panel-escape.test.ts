import { describe, expect, it } from "vitest";
import { settingsAccountPageHtml, settingsHubHtml } from "./client-hud-settings-panel.js";

// Empire names are player-chosen and were written into Settings as raw HTML.
describe("Settings shows the empire name as text", () => {
  const state = {
    meName: "Rosa's <b>Garden</b>", authUserLabel: "", me: "p1", playerColors: new Map<string, string>(), authSessionReady: true,
    playerCosmetics: new Map(), ownedCosmetics: [], authReady: true, mapRevealEligible: false
  } as unknown as Parameters<typeof settingsAccountPageHtml>[0] & Parameters<typeof settingsHubHtml>[0];

  it("escapes it on the Account page and the hub", () => {
    for (const html of [settingsAccountPageHtml(state), settingsHubHtml(state)]) {
      expect(html).toContain("Rosa&#39;s &lt;b&gt;Garden&lt;/b&gt;");
      expect(html).not.toContain("<b>Garden</b>");
    }
  });
});
