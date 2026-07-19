import { describe, expect, it } from "vitest";

import type { PlayerSubscriptionSnapshot } from "@border-empires/sim-protocol";
import { buildGatewayInitPayload } from "./init-payload.js";

// The simulation's leaderboard reports seasonal display names for AI players
// (e.g. "Freja Sund"). playerStyles feeds the client's tile-ownership name
// lookup (packages/client/src/client-owner-name/client-owner-name.ts) and
// must match the leaderboard's real name so a tile's owner label agrees with
// the leaderboard instead of showing the cosmetic "AI N" fallback string.
// Note: social-state's alliance/truce resolveByName still keys AI players by
// "AI N" (a separate registry seeded via initialSocialNameForSeedPlayer in
// auth-identity.ts) — that is a pre-existing, independent gap, not something
// this test covers.
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

  it("uses the live leaderboard's seasonal name for AI playerStyles, matching what the leaderboard shows", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, initialState, "default");

    expect(init.playerStyles).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ai-1", name: "Freja Sund" })]));
  });

  it("normalises AI leaderboard entries to 'AI N' across every leaderboard category", () => {
    const init = buildGatewayInitPayload({ playerId: "player-1", playerName: "Nauticus" }, initialState, "default");

    for (const category of ["overall", "byTiles", "byIncome", "byTechs"] as const) {
      expect(init.leaderboard[category]).toEqual(expect.arrayContaining([expect.objectContaining({ id: "ai-1", name: "AI 1" })]));
    }
  });
});
