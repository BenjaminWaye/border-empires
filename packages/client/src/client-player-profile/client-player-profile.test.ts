import { describe, expect, it, vi } from "vitest";
import { fetchActivePlayerProfileData } from "./client-player-profile.js";

const profileState = () => ({
  activePlayerProfileId: "p1" as string | undefined,
  galaxyHoldingsByPlayerId: new Map(),
  careerStatsByPlayerId: new Map(),
  socialViewByPlayerId: new Map()
});

describe("fetchActivePlayerProfileData", () => {
  it("fetches galactic holdings once per profile and caches the result across re-renders", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ planets: [], outposts: [] }) });
    global.fetch = fetchMock as unknown as typeof fetch;
    const state = profileState();

    fetchActivePlayerProfileData(state, "ws://localhost:3101/ws", () => {});
    expect(state.galaxyHoldingsByPlayerId.get("p1")).toBe("loading");

    await new Promise((resolve) => setTimeout(resolve, 0));
    // One fetch each for galactic holdings, career stats, and social view.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(state.galaxyHoldingsByPlayerId.get("p1")).toEqual({ planets: [], outposts: [], trophyCase: [] });

    // Re-rendering the same profile must not re-fetch.
    fetchActivePlayerProfileData(state, "ws://localhost:3101/ws", () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("caches a failed fetch as empty holdings instead of retrying on every subsequent render", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    global.fetch = fetchMock as unknown as typeof fetch;
    const state = profileState();

    fetchActivePlayerProfileData(state, "ws://localhost:3101/ws", () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(state.galaxyHoldingsByPlayerId.get("p1")).toEqual({ planets: [], outposts: [], trophyCase: [] });

    // The HUD re-renders on many unrelated state changes while the profile
    // stays open; a failed fetch must not turn into a retry storm.
    for (let i = 0; i < 5; i += 1) fetchActivePlayerProfileData(state, "ws://localhost:3101/ws", () => {});
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("does nothing while no profile is open", () => {
    const fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
    const state = { ...profileState(), activePlayerProfileId: undefined };
    fetchActivePlayerProfileData(state, "ws://localhost:3101/ws", () => {});
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
