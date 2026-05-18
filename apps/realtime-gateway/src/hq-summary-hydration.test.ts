import { describe, expect, it } from "vitest";
import type { CurrentSeasonSummary, SeasonArchiveRow } from "@border-empires/sim-protocol";
import { anonymizedEmpireNameForId } from "@border-empires/shared";

import {
  hydrateCurrentSeasonSummaryDisplayNames,
  hydrateSeasonArchiveDisplayNames
} from "./hq-summary-hydration.js";
import { InMemoryGatewayPlayerProfileStore } from "./player-profile-store.js";

const opaqueIdA = "AAAABBBBCCCCDDDDEEEE";
const opaqueIdB = "FFFFGGGGHHHHIIIIJJJJ";
const opaqueIdC = "KKKKLLLLMMMMNNNNOOOO";

const buildSummary = (): CurrentSeasonSummary => {
  const overall = [
    { id: opaqueIdA, name: anonymizedEmpireNameForId(opaqueIdA), tiles: 5, incomePerMinute: 10, techs: 1, score: 17, rank: 1 },
    { id: opaqueIdB, name: anonymizedEmpireNameForId(opaqueIdB), tiles: 3, incomePerMinute: 4, techs: 0, score: 8, rank: 2 },
    { id: "ai-1", name: "AI 1", tiles: 2, incomePerMinute: 2, techs: 0, score: 5, rank: 3 },
    { id: "barbarian-1", name: "Barbarians", tiles: 1, incomePerMinute: 0, techs: 0, score: 2, rank: 4 }
  ];
  const byTiles = overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.tiles, rank: entry.rank }));
  const byIncome = overall.map((entry) => ({
    id: entry.id,
    name: entry.name,
    value: entry.incomePerMinute,
    rank: entry.rank
  }));
  const byTechs = overall.map((entry) => ({ id: entry.id, name: entry.name, value: entry.techs, rank: entry.rank }));
  return {
    season: "season-1",
    seasonId: "season-1",
    seasonSequence: 1,
    status: "active",
    startedAt: 1_000,
    worldSeed: 42,
    rulesetId: "seasonal-default",
    seasonWinner: {
      playerId: opaqueIdA,
      playerName: anonymizedEmpireNameForId(opaqueIdA),
      crownedAt: 2_000,
      objectiveId: "TOWN_CONTROL",
      objectiveName: "Town Control"
    },
    leaderboard: {
      overall,
      byTiles,
      byIncome,
      byTechs,
      selfOverall: overall[0],
      selfByTiles: byTiles[0],
      selfByIncome: byIncome[0],
      selfByTechs: byTechs[0]
    },
    overall,
    byTiles,
    byIncome,
    byTechs,
    seasonVictory: [],
    onlinePlayers: 1,
    totalPlayers: overall.length,
    townCount: 4,
    updatedAt: 2_000
  };
};

describe("hydrateCurrentSeasonSummaryDisplayNames", () => {
  it("overrides leaderboard names from profile display_name", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setProfile(opaqueIdA, "Benjamin", "#abcdef");

    const hydrated = await hydrateCurrentSeasonSummaryDisplayNames(buildSummary(), store);

    expect(hydrated.leaderboard.overall[0]).toMatchObject({ id: opaqueIdA, name: "Benjamin" });
    expect(hydrated.leaderboard.byTiles[0]).toMatchObject({ id: opaqueIdA, name: "Benjamin" });
    expect(hydrated.leaderboard.byIncome[0]).toMatchObject({ id: opaqueIdA, name: "Benjamin" });
    expect(hydrated.leaderboard.byTechs[0]).toMatchObject({ id: opaqueIdA, name: "Benjamin" });
    expect(hydrated.leaderboard.selfOverall?.name).toBe("Benjamin");
    expect(hydrated.leaderboard.selfByTiles?.name).toBe("Benjamin");
    expect(hydrated.leaderboard.selfByIncome?.name).toBe("Benjamin");
    expect(hydrated.leaderboard.selfByTechs?.name).toBe("Benjamin");
    expect(hydrated.overall[0].name).toBe("Benjamin");
    expect(hydrated.byTiles[0].name).toBe("Benjamin");
    expect(hydrated.byIncome[0].name).toBe("Benjamin");
    expect(hydrated.byTechs[0].name).toBe("Benjamin");
    expect(hydrated.seasonWinner?.playerName).toBe("Benjamin");
  });

  it("falls back to anonymized name when profile is missing", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    const summary = buildSummary();

    const hydrated = await hydrateCurrentSeasonSummaryDisplayNames(summary, store);

    expect(hydrated.leaderboard.overall[1]).toMatchObject({
      id: opaqueIdB,
      name: anonymizedEmpireNameForId(opaqueIdB)
    });
    expect(hydrated.seasonWinner?.playerName).toBe(anonymizedEmpireNameForId(opaqueIdA));
  });

  it("leaves AI and Barbarians names untouched", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setProfile(opaqueIdA, "Benjamin", "#abcdef");

    const hydrated = await hydrateCurrentSeasonSummaryDisplayNames(buildSummary(), store);

    const ai = hydrated.leaderboard.overall.find((entry) => entry.id === "ai-1");
    const barbarians = hydrated.leaderboard.overall.find((entry) => entry.id === "barbarian-1");
    expect(ai?.name).toBe("AI 1");
    expect(barbarians?.name).toBe("Barbarians");
  });

  it("ignores profiles with empty display_name", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setTileColor(opaqueIdB, "#123456");

    const hydrated = await hydrateCurrentSeasonSummaryDisplayNames(buildSummary(), store);

    expect(hydrated.leaderboard.overall[1].name).toBe(anonymizedEmpireNameForId(opaqueIdB));
  });
});

describe("hydrateSeasonArchiveDisplayNames", () => {
  it("overrides archive row playerName fields when display_name is set", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    await store.setProfile(opaqueIdA, "Benjamin", "#abcdef");
    await store.setProfile(opaqueIdC, "Caesar", "#fedcba");

    const rows: SeasonArchiveRow[] = [
      {
        seasonId: "season-1",
        seasonSequence: 1,
        endedAt: 2_000,
        updatedAt: 2_000,
        winner: {
          playerId: opaqueIdA,
          playerName: anonymizedEmpireNameForId(opaqueIdA),
          crownedAt: 2_000,
          objectiveId: "TOWN_CONTROL",
          objectiveName: "Town Control"
        },
        mostTerritory: [
          { playerId: opaqueIdA, playerName: anonymizedEmpireNameForId(opaqueIdA), value: 9 },
          { playerId: opaqueIdB, playerName: anonymizedEmpireNameForId(opaqueIdB), value: 4 }
        ],
        mostPoints: [
          { playerId: opaqueIdC, playerName: anonymizedEmpireNameForId(opaqueIdC), value: 22 }
        ],
        longestSurvivalMs: [
          { playerId: opaqueIdA, playerName: anonymizedEmpireNameForId(opaqueIdA), value: 1_000 }
        ],
        replayEvents: []
      }
    ];

    const hydrated = await hydrateSeasonArchiveDisplayNames(rows, store);

    expect(hydrated[0].winner?.playerName).toBe("Benjamin");
    expect(hydrated[0].mostTerritory[0].playerName).toBe("Benjamin");
    expect(hydrated[0].mostTerritory[1].playerName).toBe(anonymizedEmpireNameForId(opaqueIdB));
    expect(hydrated[0].mostPoints[0].playerName).toBe("Caesar");
    expect(hydrated[0].longestSurvivalMs[0].playerName).toBe("Benjamin");
  });

  it("returns rows untouched when no profiles match", async () => {
    const store = new InMemoryGatewayPlayerProfileStore();
    const rows: SeasonArchiveRow[] = [
      {
        seasonId: "season-1",
        seasonSequence: 1,
        endedAt: 2_000,
        updatedAt: 2_000,
        mostTerritory: [
          { playerId: opaqueIdA, playerName: anonymizedEmpireNameForId(opaqueIdA), value: 9 }
        ],
        mostPoints: [],
        longestSurvivalMs: [],
        replayEvents: []
      }
    ];

    const hydrated = await hydrateSeasonArchiveDisplayNames(rows, store);
    expect(hydrated[0].mostTerritory[0].playerName).toBe(anonymizedEmpireNameForId(opaqueIdA));
  });
});
