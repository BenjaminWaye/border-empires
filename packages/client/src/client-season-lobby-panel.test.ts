// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderSeasonLobbyPanelHtml, bindSeasonLobbyPanel, GAME_SHARE_URL, DISCORD_INVITE_URL } from "./client-season-lobby-panel.js";

afterEach(() => {
  vi.useRealTimers();
});

describe("renderSeasonLobbyPanelHtml", () => {
  it("shows waiting count over max players", () => {
    const html = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 73, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] });
    expect(html).toContain("73 / 100 PLAYERS");
  });

  it("lists roster names without any flag picker or flag emoji", () => {
    const html = renderSeasonLobbyPanelHtml({
      seasonLobbyWaitingCount: 2,
      seasonLobbyMaxPlayers: 100,
      seasonLobbyRoster: [
        { playerId: "p1", name: "Alice" },
        { playerId: "p2", name: "Bob" }
      ]
    });
    expect(html).toContain("Alice");
    expect(html).toContain("Bob");
    expect(html).not.toContain("season-lobby-flag-select");
    expect(html).not.toContain("flag-picker");
  });

  it("escapes roster names", () => {
    const html = renderSeasonLobbyPanelHtml({
      seasonLobbyWaitingCount: 1,
      seasonLobbyMaxPlayers: 100,
      seasonLobbyRoster: [{ playerId: "p1", name: "<script>alert(1)</script>" }]
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("shows the founding-engineer badge only for their stable player id, not anyone renamed to their display name", () => {
    const html = renderSeasonLobbyPanelHtml({
      seasonLobbyWaitingCount: 2,
      seasonLobbyMaxPlayers: 100,
      seasonLobbyRoster: [
        { playerId: "VK5iriJAhickNf9ArrRweUDnq1W2", name: "KonradsDelikatessKörv" },
        { playerId: "some-other-player", name: "KonradsDelikatessKörv" }
      ]
    });
    const rows = html.split("</li>").filter((row) => row.includes("KonradsDelikatessKörv"));
    expect(rows[0]).toContain("founding-engineer-name");
    expect(rows[1]).not.toContain("founding-engineer-name");
  });

  it("includes the Discord link and invite button", () => {
    const html = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] });
    expect(html).toContain(DISCORD_INVITE_URL);
    expect(html).toContain('id="season-lobby-invite"');
  });

  it("shows the You're in confirmation only when joined=true (default)", () => {
    const joinedHtml = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] });
    expect(joinedHtml).toContain("You're in");

    const notJoinedHtml = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] }, false);
    expect(notJoinedHtml).not.toContain("You're in");
  });

  it("hides the waiting count and roster when showRoster=false, but keeps the invite actions", () => {
    const html = renderSeasonLobbyPanelHtml(
      {
        seasonLobbyWaitingCount: 5,
        seasonLobbyMaxPlayers: 100,
        seasonLobbyRoster: [{ playerId: "p1", name: "Alice" }]
      },
      false,
      false
    );
    expect(html).not.toContain("PLAYERS WAITING");
    expect(html).not.toContain("PLAYERS</div>");
    expect(html).not.toContain("Alice");
    expect(html).toContain(DISCORD_INVITE_URL);
    expect(html).toContain('id="season-lobby-invite"');
  });
});

describe("bindSeasonLobbyPanel", () => {
  it("shows inline 'Copied!' feedback and swaps the button text back after a delay", async () => {
    vi.useFakeTimers();
    const overlayEl = document.createElement("div");
    overlayEl.innerHTML = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] });
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    bindSeasonLobbyPanel({ overlayEl });
    const inviteBtn = overlayEl.querySelector("#season-lobby-invite") as HTMLButtonElement;
    const statusEl = overlayEl.querySelector("#season-lobby-invite-status") as HTMLElement;
    const originalLabel = inviteBtn.textContent;
    inviteBtn.click();
    await Promise.resolve();
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith(GAME_SHARE_URL);
    expect(inviteBtn.textContent).toBe("Copied!");
    expect(statusEl.textContent).toContain("copied");

    vi.advanceTimersByTime(2_600);
    expect(inviteBtn.textContent).toBe(originalLabel);
    expect(statusEl.textContent).toBe("");
  });

  it("falls back to legacy copy and still gives visible feedback when navigator.clipboard is unavailable", async () => {
    const overlayEl = document.createElement("div");
    overlayEl.innerHTML = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    const execCommand = vi.fn(() => true);
    document.execCommand = execCommand as unknown as typeof document.execCommand;
    bindSeasonLobbyPanel({ overlayEl });
    const inviteBtn = overlayEl.querySelector("#season-lobby-invite") as HTMLButtonElement;
    const statusEl = overlayEl.querySelector("#season-lobby-invite-status") as HTMLElement;
    inviteBtn.click();
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(inviteBtn.textContent).toBe("Copied!");
    expect(statusEl.textContent).toContain("copied");
  });

  it("shows the manual-copy link as visible feedback when every copy path fails, never a silent no-op", async () => {
    const overlayEl = document.createElement("div");
    overlayEl.innerHTML = renderSeasonLobbyPanelHtml({ seasonLobbyWaitingCount: 0, seasonLobbyMaxPlayers: 100, seasonLobbyRoster: [] });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    document.execCommand = (() => false) as unknown as typeof document.execCommand;
    bindSeasonLobbyPanel({ overlayEl });
    const inviteBtn = overlayEl.querySelector("#season-lobby-invite") as HTMLButtonElement;
    const statusEl = overlayEl.querySelector("#season-lobby-invite-status") as HTMLElement;
    inviteBtn.click();
    expect(inviteBtn.textContent).toBe("Copy failed");
    expect(statusEl.textContent).toContain(GAME_SHARE_URL);
  });
});
