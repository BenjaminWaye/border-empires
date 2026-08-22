// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { renderSeasonLobbyPanelHtml, bindSeasonLobbyPanel, flagEmoji, GAME_SHARE_URL, DISCORD_INVITE_URL } from "./client-season-lobby-panel.js";

describe("flagEmoji", () => {
  it("converts a 2-letter code into regional indicator symbols", () => {
    expect(flagEmoji("US")).toBe("\u{1F1FA}\u{1F1F8}");
  });

  it("returns empty string for an invalid code", () => {
    expect(flagEmoji("USA")).toBe("");
    expect(flagEmoji("1A")).toBe("");
    expect(flagEmoji("")).toBe("");
  });
});

describe("renderSeasonLobbyPanelHtml", () => {
  it("shows waiting count over max players", () => {
    const html = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 73, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [], myCountryFlag: "" });
    expect(html).toContain("73 / 100 PLAYERS");
  });

  it("lists roster names, showing a flag only when set", () => {
    const html = renderSeasonLobbyPanelHtml({
      seasonLobbyWaitingCount: 2,
      seasonLobbyMaxPlayers: 100,
      seasonLobbyRoster: [
        { playerId: "p1", name: "Alice", countryFlag: "US" },
        { playerId: "p2", name: "Bob" }
      ],
      myCountryFlag: ""
    });
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).toContain(flagEmoji("US"));
  });

  it("escapes roster names", () => {
    const html = renderSeasonLobbyPanelHtml({
      seasonLobbyWaitingCount: 1,
      seasonLobbyMaxPlayers: 100,
      seasonLobbyRoster: [{ playerId: "p1", name: "<script>alert(1)</script>" }],
      myCountryFlag: ""
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes the Discord link and invite button", () => {
    const html = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [], myCountryFlag: "" });
    expect(html).toContain(DISCORD_INVITE_URL);
    expect(html).toContain('id="season-lobby-invite"');
  });

  it("only shows the flag picker when myCountryFlag is unset", () => {
    expect(renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [], myCountryFlag: "" })).toContain("season-lobby-flag-select");
    expect(renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [], myCountryFlag: "US" })).not.toContain("season-lobby-flag-select");
  });
});

describe("bindSeasonLobbyPanel", () => {
  it("calls setCountryFlag when the flag select changes", () => {
    const overlayEl = document.createElement("div");
    overlayEl.innerHTML = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [], myCountryFlag: "" });
    const setCountryFlag = vi.fn(() => true);
    bindSeasonLobbyPanel({ overlayEl, state: { myCountryFlag: "" }, setCountryFlag });
    const select = overlayEl.querySelector("#season-lobby-flag-select") as HTMLSelectElement;
    select.value = "US";
    select.dispatchEvent(new Event("change"));
    expect(setCountryFlag).toHaveBeenCalledWith("US");
  });

  it("copies the share link when the invite button is clicked", async () => {
    const overlayEl = document.createElement("div");
    overlayEl.innerHTML = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [], myCountryFlag: "" });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const pushFeed = vi.fn();
    bindSeasonLobbyPanel({ overlayEl, state: { myCountryFlag: "" }, setCountryFlag: () => true, pushFeed });
    const inviteBtn = overlayEl.querySelector("#season-lobby-invite") as HTMLButtonElement;
    inviteBtn.click();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(GAME_SHARE_URL);
  });
});
