import type { SeasonWinnerView } from "@border-empires/shared";
import { describe, expect, it } from "vitest";
import { createServerVictoryPressure } from "./server-victory-pressure.js";
import {
  SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE,
  SEASON_VICTORY_ECONOMY_LEAD_MULT,
  SEASON_VICTORY_ECONOMY_MIN_INCOME,
  SEASON_VICTORY_HOLD_MS,
  SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE,
  SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
  SEASON_VICTORY_TOWN_CONTROL_SHARE,
  VICTORY_PRESSURE_DEFS
} from "./server-game-constants.js";

describe("server victory pressure", () => {
  const createVictoryFixture = (overrides?: {
    worldResourceTileCounts?: () => Record<string, number>;
    controlledResourceTileCounts?: (playerId: string) => Record<string, number>;
  }) => {
    const metrics = [
      { playerId: "p1", name: "Atlas", controlledTowns: 0, settledTiles: 0, incomePerMinute: 0, techs: 0 },
      { playerId: "p2", name: "Boreal", controlledTowns: 0, settledTiles: 0, incomePerMinute: 0, techs: 0 }
    ];
    const progressByPlayer = new Map([
      ["p1", { qualifiedCount: 2, totalIslands: 2, weakestQualifiedRatio: 0.05, weakestQualifiedOwned: 5, weakestQualifiedTotal: 100 }],
      ["p2", { qualifiedCount: 1, totalIslands: 2, weakestQualifiedRatio: 0.05, weakestQualifiedOwned: 5, weakestQualifiedTotal: 100 }]
    ]);
    const victoryPressureById = new Map();
    let nowMs = 1_000;
    let seasonWinner: SeasonWinnerView | undefined;

    const victory = createServerVictoryPressure({
      now: () => nowMs,
      townsByTile: new Map(),
      SEASON_VICTORY_TOWN_CONTROL_SHARE,
      SEASON_VICTORY_SETTLED_TERRITORY_SHARE,
      SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE,
      SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE,
      VICTORY_PRESSURE_DEFS,
      players: new Map([
        ["p1", { id: "p1", name: "Atlas" }],
        ["p2", { id: "p2", name: "Boreal" }]
      ]),
      HOLD_START_BROADCAST_DELAY_MS: 0,
      HOLD_REMAINING_BROADCAST_HOURS: [],
      FINAL_PUSH_MS: 0,
      crypto: { randomUUID: () => "event-1" },
      strategicReplayEvents: [],
      STRATEGIC_REPLAY_LIMIT: 10,
      broadcast: () => {},
      sendToPlayer: () => {},
      GLOBAL_STATUS_CACHE_TTL_MS: 60_000,
      getSeasonWinner: () => seasonWinner,
      setSeasonWinner: (winner: SeasonWinnerView | undefined) => {
        seasonWinner = winner;
      },
      getActiveSeason: () => ({ endAt: 9_999_999 }),
      victoryPressureById,
      uniqueLeader: (entries: Array<{ playerId: string; value: number }>) => {
        const sorted = [...entries].sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
        const leader = sorted[0];
        if (!leader || leader.value <= 0) return { playerId: undefined, value: leader?.value ?? 0 };
        const runnerUp = sorted[1];
        return runnerUp && runnerUp.value === leader.value ? { playerId: undefined, value: leader.value } : leader;
      },
      leadingPair: (entries: Array<{ playerId: string; value: number }>) => {
        const sorted = [...entries].sort((a, b) => b.value - a.value || a.playerId.localeCompare(b.playerId));
        const leader = sorted[0] ?? { playerId: undefined, value: 0 };
        const runnerUp = sorted[1] ?? { playerId: undefined, value: 0 };
        return {
          leaderPlayerId: leader.playerId,
          leaderValue: leader.value,
          runnerUpValue: runnerUp.value,
          tied: Boolean(runnerUp.playerId && runnerUp.value === leader.value)
        };
      },
      computeLeaderboardSnapshot: () => ({
        overall: [],
        selfOverall: undefined,
        selfByTiles: undefined,
        selfByIncome: undefined,
        selfByTechs: undefined,
        byTiles: [],
        byIncome: [],
        byTechs: []
      }),
      collectPlayerCompetitionMetrics: () => metrics,
      worldResourceTileCounts: overrides?.worldResourceTileCounts ?? (() => ({ IRON: 10 })),
      controlledResourceTileCounts: overrides?.controlledResourceTileCounts ?? ((playerId: string) => (playerId === "p1" ? { IRON: 8 } : { IRON: 4 })),
      islandLandCounts: () => new Map([[1, 100], [2, 100]]),
      claimableLandTileCount: () => 100,
      continentalFootprintProgressForPlayer: (playerId: string) => progressByPlayer.get(playerId) ?? progressByPlayer.get("p2"),
      SEASON_VICTORY_ECONOMY_MIN_INCOME,
      SEASON_VICTORY_ECONOMY_LEAD_MULT
    });

    return {
      victory,
      victoryPressureById,
      setNow: (value: number) => {
        nowMs = value;
      }
    };
  };

  it("uses the configured continent and resource thresholds in objective status and self progress", () => {
    const { victory } = createVictoryFixture();

    const objectives = victory.currentVictoryPressureObjectives();
    const resourceMonopoly = objectives.find((objective) => objective.id === "RESOURCE_MONOPOLY");
    const continentFootprint = objectives.find((objective) => objective.id === "CONTINENT_FOOTPRINT");
    const selfObjectives = victory.seasonVictoryObjectivesForPlayer("p2");
    const selfContinent = selfObjectives.find((objective) => objective.id === "CONTINENT_FOOTPRINT");

    expect(resourceMonopoly).toMatchObject({
      progressLabel: "8/10 IRON",
      thresholdLabel: "Need 80% control of one resource type",
      conditionMet: true
    });
    expect(continentFootprint).toMatchObject({
      progressLabel: "2/2 islands at 5%+ settled · weakest island 5% (5/100)",
      thresholdLabel: "Need 5% settled land on every island",
      conditionMet: true
    });
    expect(selfContinent?.selfProgressLabel).toBe("1/2 islands at 5%+ settled · weakest island 5% (5/100)");
  });

  it("starts and crowns hold tracking for resource monopoly and continent footprint using the configured thresholds", () => {
    const { victory, victoryPressureById, setNow } = createVictoryFixture();

    victory.evaluateVictoryPressure();
    expect(victoryPressureById.get("RESOURCE_MONOPOLY")).toMatchObject({ leaderPlayerId: "p1", holdStartedAt: 1_000 });
    expect(victoryPressureById.get("CONTINENT_FOOTPRINT")).toMatchObject({ leaderPlayerId: "p1", holdStartedAt: 1_000 });

    setNow(1_000 + SEASON_VICTORY_HOLD_MS);
    victory.evaluateVictoryPressure();

    expect(victory.currentSeasonWinner()).toMatchObject({
      playerId: "p1",
      objectiveId: "RESOURCE_MONOPOLY"
    });
  });

  it("does not start a resource monopoly hold when two players tie at the qualifying threshold on different resources", () => {
    const { victory, victoryPressureById } = createVictoryFixture({
      worldResourceTileCounts: () => ({ IRON: 5, GEMS: 5 }),
      controlledResourceTileCounts: (playerId: string) => (playerId === "p1" ? { IRON: 4, GEMS: 0 } : { IRON: 0, GEMS: 4 })
    });

    const resourceMonopoly = victory.currentVictoryPressureObjectives().find((objective) => objective.id === "RESOURCE_MONOPOLY");
    victory.evaluateVictoryPressure();

    expect(resourceMonopoly).toMatchObject({
      leaderName: "Contested",
      progressLabel: "Contested at 80% share",
      conditionMet: false
    });
    expect(victoryPressureById.get("RESOURCE_MONOPOLY")).not.toMatchObject({ leaderPlayerId: "p1" });
    expect(victoryPressureById.get("RESOURCE_MONOPOLY")).not.toMatchObject({ leaderPlayerId: "p2" });
  });

  it("prefers the higher ownership share even when another player owns more raw resource tiles", () => {
    const { victory, victoryPressureById } = createVictoryFixture({
      worldResourceTileCounts: () => ({ IRON: 10, GEMS: 20 }),
      controlledResourceTileCounts: (playerId: string) => (playerId === "p1" ? { IRON: 8, GEMS: 0 } : { IRON: 0, GEMS: 9 })
    });

    const resourceMonopoly = victory.currentVictoryPressureObjectives().find((objective) => objective.id === "RESOURCE_MONOPOLY");
    victory.evaluateVictoryPressure();

    expect(resourceMonopoly).toMatchObject({
      leaderPlayerId: "p1",
      leaderName: "Atlas",
      progressLabel: "8/10 IRON",
      conditionMet: true
    });
    expect(victoryPressureById.get("RESOURCE_MONOPOLY")).toMatchObject({ leaderPlayerId: "p1", holdStartedAt: 1_000 });
  });

  it("breaks equal-share monopoly ties by higher owned count before marking the objective contested", () => {
    const { victory, victoryPressureById } = createVictoryFixture({
      worldResourceTileCounts: () => ({ IRON: 10, GEMS: 5 }),
      controlledResourceTileCounts: (playerId: string) => (playerId === "p1" ? { IRON: 8, GEMS: 0 } : { IRON: 0, GEMS: 4 })
    });

    const resourceMonopoly = victory.currentVictoryPressureObjectives().find((objective) => objective.id === "RESOURCE_MONOPOLY");
    victory.evaluateVictoryPressure();

    expect(resourceMonopoly).toMatchObject({
      leaderPlayerId: "p1",
      leaderName: "Atlas",
      progressLabel: "8/10 IRON",
      conditionMet: true
    });
    expect(victoryPressureById.get("RESOURCE_MONOPOLY")).toMatchObject({ leaderPlayerId: "p1", holdStartedAt: 1_000 });
  });
});
