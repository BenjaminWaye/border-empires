import { describe, expect, it, vi } from "vitest";
import { fetchCareerStats } from "./client-player-profile-career.js";

describe("fetchCareerStats", () => {
  it("fetches and normalizes career stats from the gateway route", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ seasonsPlayed: 3, bestRank: 2, peakScore: 120, peakTiles: 30 })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const result = await fetchCareerStats("p1", "ws://localhost:3101/ws");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0] as [unknown, unknown];
    expect(String(url)).toContain("/hq/career/by-player/p1");
    expect(options).toEqual(expect.objectContaining({ headers: { Accept: "application/json" } }));
    expect(result).toEqual({ seasonsPlayed: 3, bestRank: 2, peakScore: 120, peakTiles: 30 });
  });

  it("returns undefined when the response is not ok", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false }) as unknown as typeof fetch;
    expect(await fetchCareerStats("p1", "ws://localhost:3101/ws")).toBeUndefined();
  });

  it("returns undefined when fetch throws", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;
    expect(await fetchCareerStats("p1", "ws://localhost:3101/ws")).toBeUndefined();
  });

  it("defaults missing fields to zero/null", async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as unknown as typeof fetch;
    expect(await fetchCareerStats("p1", "ws://localhost:3101/ws")).toEqual({
      seasonsPlayed: 0,
      bestRank: null,
      peakScore: null,
      peakTiles: null
    });
  });
});
