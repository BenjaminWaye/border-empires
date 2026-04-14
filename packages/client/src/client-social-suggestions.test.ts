import { describe, expect, it } from "vitest";

import { allianceTargetSuggestionOptionsHtml, allianceTargetSuggestions } from "./client-social-suggestions.js";

describe("allianceTargetSuggestions", () => {
  it("collects unique known player names and excludes the local player", () => {
    const names = allianceTargetSuggestions({
      me: "me",
      meName: "Valen",
      playerNames: new Map([
        ["me", "Valen"],
        ["p-1", "Vanguard"],
        ["p-2", "Aurora"]
      ]),
      leaderboard: {
        overall: [
          { id: "p-1", name: "Vanguard", rank: 1, score: 10, tiles: 10, incomePerMinute: 4, techs: 2 },
          { id: "p-3", name: "Valeguard", rank: 2, score: 9, tiles: 9, incomePerMinute: 3, techs: 2 }
        ],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      },
      incomingAllianceRequests: [{ id: "a1", fromPlayerId: "p-4", toPlayerId: "me", fromName: "Vael", createdAt: 1, expiresAt: 2 }],
      outgoingAllianceRequests: [{ id: "a2", fromPlayerId: "me", toPlayerId: "p-5", toName: "Aurora", createdAt: 1, expiresAt: 2 }],
      incomingTruceRequests: [{ id: "t1", fromPlayerId: "p-6", toPlayerId: "me", fromName: "Valkyr", createdAt: 1, expiresAt: 2, durationHours: 12 }],
      outgoingTruceRequests: [],
      activeTruces: [
        {
          otherPlayerId: "p-7",
          otherPlayerName: "Barbarians",
          startedAt: 1,
          endsAt: 2,
          createdByPlayerId: "p-7"
        }
      ]
    });

    expect(names).toEqual(["Aurora", "Vael", "Valeguard", "Valkyr", "Vanguard"]);
  });

  it("renders datalist option markup for suggestion names", () => {
    expect(allianceTargetSuggestionOptionsHtml(["Vanguard", "Valeguard"])).toContain('<option value="Vanguard"></option>');
  });
});
