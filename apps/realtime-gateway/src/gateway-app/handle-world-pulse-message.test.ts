import { describe, expect, it, vi } from "vitest";

import { handleRequestWorldPulseMessage } from "./handle-world-pulse-message.js";

const activity = {
  generatedAt: "2026-09-26T12:00:00.000Z", alliances: [], allianceBreaks: [], truceWatch: [], fortification: [], wars: [], territoryMomentum: [], biggestSwing24h: null, frontlineHotspots: [], manpowerLost24h: 0, biggestBattle24h: null, fiercestAttacker24h: null, toughestTarget24h: null, growth: [], dailyStory: [],
  powerScore: [{ id: "p1", name: "P1", tiles: 1, incomePerMinute: 1, techs: 1, manpowerCap: 1, score: 1, rank: 1 }]
};

describe("handleRequestWorldPulseMessage", () => {
  it("returns a player-scoped pulse and stores its rank baseline", async () => {
    const sendJson = vi.fn();
    const setWorldPulseRank = vi.fn().mockResolvedValue({});
    await handleRequestWorldPulseMessage({
      playerId: "p1", getActivity: async () => ({ activity, seasonId: "season-3" }),
      profileStore: { get: async () => undefined, setWorldPulseRank }, invalidateProfileCache: vi.fn(), sendJson
    });
    expect(sendJson).toHaveBeenCalledWith(expect.objectContaining({ type: "WORLD_PULSE", pulse: expect.objectContaining({ rank: 1 }) }));
    expect(setWorldPulseRank).toHaveBeenCalledWith("p1", 1, "season-3");
  });
});
