import { describe, expect, it } from "vitest";
import { FakeWebSocket, createState, bindWithDeps } from "./client-network.error-regression.test-helpers.js";

describe("client network regression guards — REVEAL_EMPIRE_STATS_RESULT", () => {
  it("resolves the revealed empire's real display name instead of the sim's raw player-id fallback", () => {
    const state = createState();
    state.playerNames.set("rival-1", "Needle Empire");
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "REVEAL_EMPIRE_STATS_RESULT",
        stats: {
          playerId: "rival-1",
          playerName: "rival-1",
          revealedAt: 1_000,
          tiles: 24,
          settledTiles: 15,
          frontierTiles: 9,
          controlledTowns: 3,
          incomePerMinute: 12.5,
          techCount: 4,
          gold: 1234,
          manpower: 21_378,
          manpowerCap: 54_000,
          strategicResources: { FOOD: 10, TITANIUM: 20, CRYSTAL: 30, UMBRITE: 40, SHARD: 1 }
        }
      })
    });

    expect(state.activeRevealEmpireStatsPopup.playerName).toBe("Needle Empire");
    expect(state.revealedEmpireStatsByPlayer.get("rival-1")?.playerName).toBe("Needle Empire");
  });

  it("falls back to the sim-provided playerName when the client has no name registered for that player", () => {
    const state = createState();
    const ws = new FakeWebSocket();
    bindWithDeps(state, ws);

    ws.emit("message", {
      data: JSON.stringify({
        type: "REVEAL_EMPIRE_STATS_RESULT",
        stats: {
          playerId: "rival-2",
          playerName: "rival-2",
          revealedAt: 1_000,
          tiles: 1,
          settledTiles: 1,
          frontierTiles: 0,
          controlledTowns: 0,
          incomePerMinute: 0,
          techCount: 0,
          gold: 0,
          manpower: 0,
          manpowerCap: 150,
          strategicResources: { FOOD: 0, TITANIUM: 0, CRYSTAL: 0, UMBRITE: 0, SHARD: 0 }
        }
      })
    });

    expect(state.activeRevealEmpireStatsPopup.playerName).toBe("rival-2");
  });
});
