import { describe, expect, it, vi } from "vitest";
import { careerStatsHtml, fetchCareerStats } from "./client-player-profile-career.js";

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

describe("careerStatsHtml", () => {
  it("renders nothing while loading or unset", () => {
    expect(careerStatsHtml("loading")).toBe("");
    expect(careerStatsHtml(undefined)).toBe("");
  });

  it("renders nothing when the player has never finished a season", () => {
    expect(careerStatsHtml({ seasonsPlayed: 0, bestRank: null, peakScore: null, peakTiles: null })).toBe("");
  });

  it("renders seasons played, best rank, and peak stats", () => {
    const html = careerStatsHtml({ seasonsPlayed: 5, bestRank: 1, peakScore: 300, peakTiles: 42 });
    expect(html).toContain("Career Stats");
    expect(html).toContain("Seasons played: <strong>5</strong>");
    expect(html).toContain("Best rank finish: <strong>#1</strong>");
    expect(html).toContain("Peak score: <strong>300</strong>");
    expect(html).toContain("Peak tiles held: <strong>42</strong>");
  });

  it("omits fields that are null", () => {
    const html = careerStatsHtml({ seasonsPlayed: 2, bestRank: null, peakScore: null, peakTiles: null });
    expect(html).toContain("Seasons played: <strong>2</strong>");
    expect(html).not.toContain("Best rank finish");
    expect(html).not.toContain("Peak score");
    expect(html).not.toContain("Peak tiles held");
  });
});
