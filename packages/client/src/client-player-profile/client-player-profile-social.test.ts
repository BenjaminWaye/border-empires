import { describe, expect, it, vi } from "vitest";
import { fetchPlayerSocialView } from "./client-player-profile-social.js";

describe("fetchPlayerSocialView", () => {
  it("fetches and normalizes a player's social view from the gateway route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        allies: ["ally-1"],
        activeTruces: [{ otherPlayerId: "p2", otherPlayerName: "Valka", endsAt: 5_000 }],
        truceBreaksThisSeason: [{ targetPlayerId: "p3", targetPlayerName: "Astrid", brokenAt: 1_000 }]
      })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchPlayerSocialView("p1", "ws://localhost:3101/ws");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [unknown, unknown];
    expect(String(url)).toContain("/hq/social/by-player/p1");
    expect(result).toEqual({
      allies: ["ally-1"],
      activeTruces: [{ otherPlayerId: "p2", otherPlayerName: "Valka", endsAt: 5_000 }],
      truceBreaksThisSeason: [{ targetPlayerId: "p3", targetPlayerName: "Astrid", brokenAt: 1_000 }]
    });
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
    expect(await fetchPlayerSocialView("p1", "ws://localhost:3101/ws")).toEqual({ allies: [], activeTruces: [], truceBreaksThisSeason: [] });
  });
});
