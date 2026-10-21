import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { initialSocialNameForSeedPlayer } from "../auth-identity/auth-identity.js";
import { buildGatewayInitPayload } from "./init-payload.js";

// Player styles name AIs exactly as diplomacy does (their listed seasonal name,
// from the id), so a name the client shows resolves for a truce or alliance
// offer; the leaderboard keeps whatever the simulation reports.
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

  // Regression: player styles forced "AI 1" instead of the AI's seasonal name. They must still match
  // diplomacy's name (Alden for ai-1), not a differently spelled live leaderboard name.
  it("uses the AI's listed seasonal name for player styles, matching diplomacy", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, initialState, "default");

    expect(init.playerStyles).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ai-1", name: "Alden" })]));
    expect(initialSocialNameForSeedPlayer("ai-1", "Freja Sund")).toBe("Alden");
  });

  it("preserves seasonal AI leaderboard names across every category", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, initialState, "default");

    for (const category of ["overall", "byTiles", "byIncome", "byTechs"] as const) {
      expect(init.leaderboard[category]).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ai-1", name: "Freja Sund" })]));
    }
  });
});
