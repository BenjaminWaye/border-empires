import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { buildGatewayInitPayload } from "./init-payload.js";

// Keep diplomacy identifiers stable while preserving seasonal names for display.
describe("gateway init AI name normalization", () => {
  const initialState: PlayerSubscriptionSnapshot = {
    playerId: "player-1",
    worldStatus: {
      leaderboard: {
        overall: [{ id: "ai-1", name: "Freja Sund", tiles: 8, incomePerMinute: 4.2, techs: 1, score: 42, rank: 1 }],
        byTiles: [{ id: "ai-1", name: "Freja Sund", value: 8, rank: 1 }],
        byIncome: [{ id: "ai-1", name: "Freja Sund", value: 4.2, rank: 1 }],
        byTechs: [{ id: "ai-1", name: "Freja Sund", value: 1, rank: 1 }]
      },
      seasonVictory: []
    },
    tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }]
  };

  it("normalises AI playerStyles names to 'AI N' even when the live leaderboard reports a seasonal name", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, initialState, "default");

    expect(init.playerStyles).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ai-1", name: "AI 1" })]));
  });

  it("preserves seasonal AI leaderboard names across every category", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, initialState, "default");

    for (const category of ["overall", "byTiles", "byIncome", "byTechs"] as const) {
      expect(init.leaderboard[category]).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ai-1", name: "Freja Sund" })]));
    }
  });
});
