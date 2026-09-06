import { describe, expect, it, vi } from "vitest";
import { playerProfileHtml, renderPlayerProfileOverlay } from "./client-player-profile.js";

const baseArgs = {
  profilePlayerId: "p1",
  viewerPlayerId: "me",
  playerName: "Nauticus",
  leaderboardOverall: [{ id: "p1", rank: 3, name: "Nauticus", score: 42, tiles: 10, incomePerMinute: 1, techs: 5, manpowerCap: 200 }],
  allies: [] as string[],
  activeTruces: [] as { otherPlayerId: string; otherPlayerName: string; startedAt: number; endsAt: number; createdByPlayerId: string }[],
  truceBreaksThisSeason: [] as { targetPlayerId: string; targetPlayerName: string; brokenAt: number }[],
  galaxyHoldings: undefined,
  careerStats: undefined,
  socialView: undefined,
  playerNameForOwner: (ownerId?: string | null) => (ownerId ? `Name-${ownerId}` : undefined),
  nowMs: 1_000_000
};

describe("playerProfileHtml", () => {
  it("shows the season snapshot from the leaderboard entry", () => {
    const html = playerProfileHtml(baseArgs);
    expect(html).toContain("Nauticus");
    expect(html).toContain("Rank #3");
    expect(html).toContain("42");
  });

  it("shows an oathbreaker badge and broken-truce list only when viewing your own profile", () => {
    const truceBreaksThisSeason = [{ targetPlayerId: "p2", targetPlayerName: "Valka", brokenAt: 900_000 }];

    const selfProfile = playerProfileHtml({ ...baseArgs, profilePlayerId: "me", truceBreaksThisSeason });
    expect(selfProfile).toContain("Oathbreaker");
    expect(selfProfile).toContain("Valka");

    const otherProfile = playerProfileHtml({ ...baseArgs, profilePlayerId: "p1", truceBreaksThisSeason });
    expect(otherProfile).not.toContain("Oathbreaker");
    expect(otherProfile).not.toContain("Valka");
    expect(otherProfile).toContain("isn't available yet");
  });

  it("labels the relationship as Allied when the profile target is an ally", () => {
    const html = playerProfileHtml({ ...baseArgs, allies: ["p1"] });
    expect(html).toContain("Allied");
  });

  it("shows active truce status with the viewer, with the real remaining time rather than a fixed 'just now'", () => {
    const html = playerProfileHtml({
      ...baseArgs,
      // endsAt is ~16.7 minutes after nowMs (1_000_000).
      activeTruces: [{ otherPlayerId: "p1", otherPlayerName: "Nauticus", startedAt: 0, endsAt: 2_000_000, createdByPlayerId: "me" }]
    });
    expect(html).toContain("active truce");
    expect(html).toContain("ending in 17m");
    expect(html).not.toContain("just now");
  });

  it("shows a loading placeholder while galactic holdings are being fetched", () => {
    const html = playerProfileHtml({ ...baseArgs, galaxyHoldings: "loading" });
    expect(html).toContain("Galactic Holdings");
    expect(html).toContain("Loading");
  });

  it("lists Planets and Outposts once galactic holdings load, and omits the section when there are none", () => {
    const withHoldings = playerProfileHtml({
      ...baseArgs,
      galaxyHoldings: {
        planets: [{ seasonSequence: 3, objectiveName: "Town Control", specialization: "INDUSTRIAL", planetName: "Nova Terra" }],
        outposts: [{ seasonSequence: 4, specialization: "EXTRACTION" }]
      }
    });
    expect(withHoldings).toContain("Nova Terra");
    expect(withHoldings).toContain("Town Control");
    expect(withHoldings).toContain("Outpost");

    const withoutHoldings = playerProfileHtml({ ...baseArgs, galaxyHoldings: { planets: [], outposts: [] } });
    expect(withoutHoldings).not.toContain("Galactic Holdings");
  });

  it("shows the career trophy case when the player has historical wins", () => {
    const html = playerProfileHtml({
      ...baseArgs,
      galaxyHoldings: {
        planets: [],
        outposts: [],
        trophyCase: [{ objectiveId: "TOWN_CONTROL", objectiveName: "Town Control", count: 3 }]
      }
    });
    expect(html).toContain("Career Trophy Case");
    expect(html).toContain("Town Control ×3");
  });

  it("shows career stats once loaded, and omits the section while loading or with zero seasons", () => {
    const loading = playerProfileHtml({ ...baseArgs, careerStats: "loading" });
    expect(loading).not.toContain("Career Stats");

    const zeroSeasons = playerProfileHtml({ ...baseArgs, careerStats: { seasonsPlayed: 0, bestRank: null, peakScore: null, peakTiles: null } });
    expect(zeroSeasons).not.toContain("Career Stats");

    const withStats = playerProfileHtml({
      ...baseArgs,
      careerStats: { seasonsPlayed: 4, bestRank: 1, peakScore: 250, peakTiles: 60 }
    });
    expect(withStats).toContain("Career Stats");
    expect(withStats).toContain("Seasons played: <strong>4</strong>");
    expect(withStats).toContain("Best rank finish: <strong>#1</strong>");
    expect(withStats).toContain("Peak score: <strong>250</strong>");
    expect(withStats).toContain("Peak tiles held: <strong>60</strong>");
  });

  it("shows the profiled player's active alliances and truces once loaded", () => {
    const html = playerProfileHtml({
      ...baseArgs,
      socialView: {
        allies: ["ally-1"],
        activeTruces: [{ otherPlayerId: "p3", otherPlayerName: "Valka", endsAt: 61_000 }]
      }
    });
    expect(html).toContain("Active Alliances");
    expect(html).toContain("Name-ally-1");
    expect(html).toContain("Active Truces");
    expect(html).toContain("Valka");
  });
});

describe("renderPlayerProfileOverlay", () => {
  const fakeOverlayEl = () => ({ innerHTML: "", style: { display: "" } }) as unknown as HTMLDivElement;

  it("fetches galactic holdings once per profile and caches the result across re-renders", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ planets: [], outposts: [] })
    });
    global.fetch = fetchMock as unknown as typeof fetch;

    const dom = { playerProfileOverlayEl: fakeOverlayEl() };
    const state = {
      activePlayerProfileId: "p1",
      leaderboard: {
        overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined,
        byTiles: [], byIncome: [], byTechs: []
      },
      allies: [] as string[],
      activeTruces: [] as any[],
      truceBreaksThisSeason: [] as any[],
      galaxyHoldingsByPlayerId: new Map(),
      careerStatsByPlayerId: new Map(),
      socialViewByPlayerId: new Map()
    };
    const playerNameForOwner = () => "Nauticus";

    renderPlayerProfileOverlay(dom, state, playerNameForOwner, "ws://localhost:3101/ws", () => {});
    expect(state.galaxyHoldingsByPlayerId.get("p1")).toBe("loading");
    expect(dom.playerProfileOverlayEl.innerHTML).toContain("Loading");

    await new Promise((resolve) => setTimeout(resolve, 0));
    // One fetch each for galactic holdings, career stats, and social view.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(state.galaxyHoldingsByPlayerId.get("p1")).toEqual({ planets: [], outposts: [], trophyCase: [] });

    // Re-rendering the same profile must not re-fetch.
    renderPlayerProfileOverlay(dom, state, playerNameForOwner, "ws://localhost:3101/ws", () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caches a failed fetch as empty holdings instead of retrying on every subsequent render", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;

    const dom = { playerProfileOverlayEl: fakeOverlayEl() };
    const state = {
      activePlayerProfileId: "p1",
      leaderboard: {
        overall: [], selfOverall: undefined, selfByTiles: undefined, selfByIncome: undefined, selfByTechs: undefined,
        byTiles: [], byIncome: [], byTechs: []
      },
      allies: [] as string[],
      activeTruces: [] as any[],
      truceBreaksThisSeason: [] as any[],
      galaxyHoldingsByPlayerId: new Map(),
      careerStatsByPlayerId: new Map(),
      socialViewByPlayerId: new Map()
    };
    const playerNameForOwner = () => "Nauticus";

    renderPlayerProfileOverlay(dom, state, playerNameForOwner, "ws://localhost:3101/ws", () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(state.galaxyHoldingsByPlayerId.get("p1")).toEqual({ planets: [], outposts: [], trophyCase: [] });

    // The HUD re-renders on many unrelated state changes while the profile
    // stays open; a failed fetch must not turn into a retry storm.
    for (let i = 0; i < 5; i += 1) {
      renderPlayerProfileOverlay(dom, state, playerNameForOwner, "ws://localhost:3101/ws", () => {});
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
