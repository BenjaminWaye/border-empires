import { describe, expect, it, vi } from "vitest";
import { fetchPlayerSocialView, playerSocialHtml } from "./client-player-profile-social.js";

describe("fetchPlayerSocialView", () => {
  it("fetches and normalizes a player's social view from the gateway route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ allies: ["ally-1"], activeTruces: [{ otherPlayerId: "p2", otherPlayerName: "Valka", endsAt: 5_000 }] })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchPlayerSocialView("p1", "ws://localhost:3101/ws");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [unknown, unknown];
    expect(String(url)).toContain("/hq/social/by-player/p1");
    expect(result).toEqual({ allies: ["ally-1"], activeTruces: [{ otherPlayerId: "p2", otherPlayerName: "Valka", endsAt: 5_000 }] });
  });

  it("returns undefined when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await fetchPlayerSocialView("p1", "ws://localhost:3101/ws")).toBeUndefined();
  });

  it("returns undefined when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(await fetchPlayerSocialView("p1", "ws://localhost:3101/ws")).toBeUndefined();
  });

  it("defaults missing fields to empty arrays", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await fetchPlayerSocialView("p1", "ws://localhost:3101/ws")).toEqual({ allies: [], activeTruces: [] });
  });
});

describe("playerSocialHtml", () => {
  const playerNameForOwner = (id?: string | null) => (id === "ally-1" ? "Alden" : undefined);

  it("renders nothing while loading, unset, or empty", () => {
    expect(playerSocialHtml("loading", playerNameForOwner, 0)).toBe("");
    expect(playerSocialHtml(undefined, playerNameForOwner, 0)).toBe("");
    expect(playerSocialHtml({ allies: [], activeTruces: [] }, playerNameForOwner, 0)).toBe("");
  });

  it("lists active alliances, resolving names via playerNameForOwner", () => {
    const html = playerSocialHtml({ allies: ["ally-1"], activeTruces: [] }, playerNameForOwner, 0);
    expect(html).toContain("Active Alliances");
    expect(html).toContain("Alden");
  });

  it("falls back to a shortened id label when the name can't be resolved", () => {
    const html = playerSocialHtml({ allies: ["unknown-player-id"], activeTruces: [] }, playerNameForOwner, 0);
    expect(html).toContain("ID: unknown-");
  });

  it("lists active truces with remaining time", () => {
    const html = playerSocialHtml(
      { allies: [], activeTruces: [{ otherPlayerId: "p2", otherPlayerName: "Valka", endsAt: 60_000 }] },
      playerNameForOwner,
      0
    );
    expect(html).toContain("Active Truces");
    expect(html).toContain("Valka");
    expect(html).toContain("1m remaining");
  });
});
