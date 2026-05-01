import { describe, expect, it } from "vitest";

import { anonymizedEmpireNameForId } from "@border-empires/shared";

import { InMemoryGatewayCommandStore } from "./command-store.js";
import { hydrateVisibleLeaderboardProfileOverrides } from "./gateway-app.js";
import { createPlayerProfileOverrides } from "./player-profile-overrides.js";
import { InMemoryGatewayPlayerProfileStore } from "./player-profile-store.js";
import { buildInitMessage } from "./reconnect-recovery.js";

describe("gateway profile recovery", () => {
  it("hydrates visible anonymized leaderboard rows from persisted player profiles without a snapshot bootstrap", async () => {
    const benjaminId = "qwe9OiQwxGS5LKwcAwG5wzNCd3P3";
    const objectiveLeaderId = "obj9OiQwxGS5LKwcAwG5wzNCd3P9";
    const profileStore = new InMemoryGatewayPlayerProfileStore();
    await profileStore.setProfile(benjaminId, "Benjamin Waye", "#654321");
    await profileStore.setProfile(objectiveLeaderId, "Nauticus", "#123456");
    const profileOverrides = createPlayerProfileOverrides();
    const initialState = {
      playerId: "player-1",
      tiles: [{ x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }],
      worldStatus: {
        leaderboard: {
          overall: [
            { id: "player-1", rank: 1, name: "player-1", score: 10, tiles: 4, incomePerMinute: 2, techs: 0 },
            { id: benjaminId, rank: 2, name: anonymizedEmpireNameForId(benjaminId), score: 4, tiles: 1, incomePerMinute: 1, techs: 0 }
          ],
          byTiles: [
            { id: "player-1", rank: 1, name: "player-1", value: 4 },
            { id: benjaminId, rank: 2, name: anonymizedEmpireNameForId(benjaminId), value: 1 }
          ],
          byIncome: [
            { id: "player-1", rank: 1, name: "player-1", value: 2 },
            { id: benjaminId, rank: 2, name: anonymizedEmpireNameForId(benjaminId), value: 1 }
          ],
          byTechs: [
            { id: "player-1", rank: 1, name: "player-1", value: 0 },
            { id: benjaminId, rank: 2, name: anonymizedEmpireNameForId(benjaminId), value: 0 }
          ],
          selfOverall: { id: "player-1", rank: 1, name: "player-1", score: 10, tiles: 4, incomePerMinute: 2, techs: 0 },
          selfByTiles: { id: "player-1", rank: 1, name: "player-1", value: 4 },
          selfByIncome: { id: "player-1", rank: 1, name: "player-1", value: 2 },
          selfByTechs: { id: "player-1", rank: 1, name: "player-1", value: 0 }
        },
        seasonVictory: [
          {
            id: "TOWN_CONTROL",
            name: "Town Control",
            description: "Own a dominant share of towns.",
            leaderPlayerId: objectiveLeaderId,
            leaderName: anonymizedEmpireNameForId(objectiveLeaderId),
            progressLabel: "3/5 towns",
            thresholdLabel: "Need 5 towns",
            holdDurationSeconds: 21600,
            statusLabel: "Pressure building",
            conditionMet: false
          }
        ]
      }
    };

    await hydrateVisibleLeaderboardProfileOverrides(initialState, profileStore, profileOverrides);
    const init = await buildInitMessage(
      { playerId: "player-1", playerName: "player-1" },
      new InMemoryGatewayCommandStore(),
      initialState,
      "default",
      undefined,
      profileOverrides
    );

    expect(init.leaderboard.overall).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: benjaminId, name: "Benjamin Waye" })])
    );
    expect(init.playerStyles).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: benjaminId, name: "Benjamin Waye" })])
    );
    expect(init.seasonVictory).toEqual(
      expect.arrayContaining([expect.objectContaining({ leaderPlayerId: objectiveLeaderId, leaderName: "Nauticus" })])
    );
  });
});
