import { describe, expect, it } from "vitest";

import {
  buildEconomicHegemonyObjective,
  computeSeasonVictory,
  economicHegemonySelfProgressLabel,
  mergeSelfProgress,
  seasonVictoryForBroadcast
} from "./season-victory-objectives.js";

type WorldTileFixture = Parameters<typeof computeSeasonVictory>[0][number];
type LeaderboardFixture = Parameters<typeof computeSeasonVictory>[1];
type PlayersFixture = Parameters<typeof computeSeasonVictory>[2];

describe("computeSeasonVictory", () => {
  it("computes a self-progress label for every non-leading competitive player from one scan", () => {
    // Regression for the bug where performGlobalStatusBroadcast always passed an
    // empty playerObjectives array, so no player (leader or not) ever received a
    // selfProgressLabel and the client's "You: ..." comparison line never rendered.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 10, techs: 0, score: 10, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 4, techs: 0, score: 4, rank: 2 }
    ];
    const players: PlayersFixture = [
      { id: "player-1", allies: [] },
      { id: "player-2", allies: [] }
    ] as PlayersFixture;

    const { objectives, selfProgressLabelsByPlayerId } = computeSeasonVictory(worldTiles, leaderboardOverall, players);

    const economicHegemony = objectives.find((objective) => objective.id === "ECONOMIC_HEGEMONY");
    expect(economicHegemony?.leaderPlayerId).toBe("player-1");

    const runnerUpLabels = selfProgressLabelsByPlayerId.get("player-2");
    expect(runnerUpLabels?.get("ECONOMIC_HEGEMONY")).toBe("5760.0 gold/day");

    // The objective's leader never gets their own comparison line — the client
    // already renders "Leader: You" for that case.
    expect(selfProgressLabelsByPlayerId.get("player-1")?.has("ECONOMIC_HEGEMONY")).toBe(false);
  });
});

describe("objective progress (docs/galactic-campaign-design.md §3 Outpost/Stipend tiering)", () => {
  it("computes ECONOMIC_HEGEMONY progress as the harder of the income and lead-over-runner-up constraints", () => {
    // MIN_INCOME is 1000/1440 gold/min and LEAD_MULT is 1.33. The leader (top
    // earner by income) clears MIN_INCOME comfortably (1200 >= 1000, fraction
    // 1.2) but a close runner-up at 1000 leaves the lead requirement short
    // (1200 < 1000*1.33 = 1330) -- the lead fraction (~0.90) is the binding,
    // smaller constraint, so progress should track it, not the looser income
    // fraction, and conditionMet should still be false.
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 1200 / 1440, techs: 0, score: 0, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 1000 / 1440, techs: 0, score: 0, rank: 2 }
    ];
    const objective = buildEconomicHegemonyObjective(leaderboardOverall);
    expect(objective.progress).toBeCloseTo(1200 / (1000 * 1.33), 5);
    expect(objective.conditionMet).toBe(false);
  });

  it("reports ECONOMIC_HEGEMONY progress of 1 once the condition is met", () => {
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 2000 / 1440, techs: 0, score: 0, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100 / 1440, techs: 0, score: 0, rank: 2 }
    ];
    const objective = buildEconomicHegemonyObjective(leaderboardOverall);
    expect(objective.conditionMet).toBe(true);
    expect(objective.progress).toBe(1);
  });

  it("computes TOWN_CONTROL progress as leader towns over the 50%-of-all-towns target", () => {
    // 4 total town tiles -> townTarget = ceil(4 * 0.5) = 2. player-1 owns 1.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "SETTLEMENT" },
      { x: 1, y: 0, terrain: "LAND", townType: "SETTLEMENT" },
      { x: 2, y: 0, terrain: "LAND", townType: "SETTLEMENT" },
      { x: 3, y: 0, terrain: "LAND", townType: "SETTLEMENT" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 0, techs: 0, score: 0, rank: 1 }
    ];
    const players: PlayersFixture = [{ id: "player-1", allies: [] }] as PlayersFixture;

    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const townControl = objectives.find((o) => o.id === "TOWN_CONTROL");
    expect(townControl?.progress).toBe(0.5);
  });

  it("computes RESOURCE_MONOPOLY progress as the leader's best resource share over the 80% target", () => {
    // 5 GEMS tiles total, player-1 owns 2 -> share = 0.4, progress = 0.4/0.8 = 0.5.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", resource: "GEMS" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-1", resource: "GEMS" },
      { x: 2, y: 0, terrain: "LAND", resource: "GEMS" },
      { x: 3, y: 0, terrain: "LAND", resource: "GEMS" },
      { x: 4, y: 0, terrain: "LAND", resource: "GEMS" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 2, incomePerMinute: 0, techs: 0, score: 0, rank: 1 }
    ];
    const players: PlayersFixture = [{ id: "player-1", allies: [] }] as PlayersFixture;

    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const resourceMonopoly = objectives.find((o) => o.id === "RESOURCE_MONOPOLY");
    expect(resourceMonopoly?.progress).toBeCloseTo(0.5, 5);
  });

  it("computes MARITIME_SUPREMACY progress as leader docks over the dock target", () => {
    // 10 dock tiles total -> target = max(3, ceil(10 * 0.55)) = 6. player-1 owns 3.
    const worldTiles: WorldTileFixture[] = Array.from({ length: 10 }, (_, i) => ({
      x: i,
      y: 0,
      terrain: "LAND",
      dockId: `dock-${i}`,
      ...(i < 3 ? { ownerId: "player-1", ownershipState: "SETTLED" } : {})
    })) as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 3, incomePerMinute: 0, techs: 0, score: 0, rank: 1 }
    ];
    const players: PlayersFixture = [{ id: "player-1", allies: [] }] as PlayersFixture;

    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const maritimeSupremacy = objectives.find((o) => o.id === "MARITIME_SUPREMACY");
    expect(maritimeSupremacy?.progress).toBeCloseTo(0.5, 5);
  });

  it("computes DIPLOMATIC_DOMINANCE progress as bloc-controlled tiles over the 66%-of-land target", () => {
    // 10 land tiles total -> target = ceil(10 * 0.66) = 7. player-1 controls 3.
    const worldTiles: WorldTileFixture[] = Array.from({ length: 10 }, (_, i) => ({
      x: i,
      y: 0,
      terrain: "LAND",
      ...(i < 3 ? { ownerId: "player-1", ownershipState: "SETTLED" } : {})
    })) as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 3, incomePerMinute: 0, techs: 0, score: 0, rank: 1 }
    ];
    const players: PlayersFixture = [{ id: "player-1", allies: [] }] as PlayersFixture;

    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const diplomaticDominance = objectives.find((o) => o.id === "DIPLOMATIC_DOMINANCE");
    expect(diplomaticDominance?.progress).toBeCloseTo(3 / 7, 5);
  });

  it("clamps progress to 1 and never reports a value above it once a threshold is overshot", () => {
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "SETTLEMENT" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 0, techs: 0, score: 0, rank: 1 }
    ];
    const players: PlayersFixture = [{ id: "player-1", allies: [] }] as PlayersFixture;

    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const townControl = objectives.find((o) => o.id === "TOWN_CONTROL");
    expect(townControl?.conditionMet).toBe(true);
    expect(townControl?.progress).toBe(1);
  });
});

describe("buildEconomicHegemonyObjective", () => {
  it("derives the same ECONOMIC_HEGEMONY objective as computeSeasonVictory from just the leaderboard", () => {
    // Regression for the leaderboard-panel bug where the "Overall" income column
    // (refreshed every broadcast tick from the live leaderboard) and the Economic
    // Hegemony pressure card (only refreshed on the ~5-min recomputeAndPersistCurrentSummary
    // cadence) showed different gold/minute numbers for the same player. The fix makes
    // buildEconomicHegemonyObjective the single source of truth, called both by the full
    // computeSeasonVictory() pass and directly from the live leaderboard on every broadcast
    // tick (see simulation-service.ts performGlobalStatusBroadcast) — so they never drift.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Alden Vale", tiles: 1, incomePerMinute: 265, techs: 0, score: 265, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100, techs: 0, score: 100, rank: 2 }
    ];
    const players: PlayersFixture = [
      { id: "player-1", allies: [] },
      { id: "player-2", allies: [] }
    ] as PlayersFixture;

    const live = buildEconomicHegemonyObjective(leaderboardOverall);
    const { objectives } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const fromFullScan = objectives.find((objective) => objective.id === "ECONOMIC_HEGEMONY");

    expect(live).toEqual(fromFullScan);
    expect(live.progressLabel).toBe("381600.0 gold/day vs 144000.0");
    expect(live.leaderPlayerId).toBe("player-1");
  });

  it("self-progress label always matches the same format as the objective's progressLabel", () => {
    expect(economicHegemonySelfProgressLabel(100)).toBe("144000.0 gold/day");
    expect(economicHegemonySelfProgressLabel(0)).toBe("0.0 gold/day");
  });
});

describe("seasonVictoryForBroadcast", () => {
  const cachedObjectives = [
    {
      id: "ECONOMIC_HEGEMONY" as const,
      name: "Economic Ascendancy",
      description: "Lead the world economy.",
      leaderName: "Stale Leader",
      progressLabel: "200.0 gold/m vs 50.0",
      thresholdLabel: "Need at least 200 gold/m and 33% lead",
      holdDurationSeconds: 21600,
      statusLabel: "Pressure building",
      conditionMet: false,
      leaderPlayerId: "player-1"
    },
    {
      id: "TOWN_CONTROL" as const,
      name: "Town Control",
      description: "Control 50% of all towns.",
      leaderName: "Someone",
      progressLabel: "3/10 towns",
      thresholdLabel: "Need 10 towns",
      holdDurationSeconds: 21600,
      statusLabel: "Pressure building",
      conditionMet: false
    }
  ];

  it("replaces the stale cached ECONOMIC_HEGEMONY objective with the live one and leaves other objectives untouched", () => {
    // Regression for the leaderboard-panel bug: the cached objective (from the ~5-min
    // recompute) said 200, the live leaderboard says 265 — the broadcast payload must
    // reflect 265, matching the "Overall" income column exactly.
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Alden Vale", tiles: 1, incomePerMinute: 265, techs: 0, score: 265, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100, techs: 0, score: 100, rank: 2 }
    ];
    const liveEconomicHegemony = buildEconomicHegemonyObjective(leaderboardOverall);

    const result = seasonVictoryForBroadcast(cachedObjectives, undefined, liveEconomicHegemony, "player-2", 100);

    const economic = result.find((o) => o.id === "ECONOMIC_HEGEMONY");
    expect(economic?.progressLabel).toBe("381600.0 gold/day vs 144000.0");
    expect(economic?.selfProgressLabel).toBe("144000.0 gold/day");
    expect(result.find((o) => o.id === "TOWN_CONTROL")).toEqual(cachedObjectives[1]);
  });

  it("does not attach a self-progress label for the objective's own leader", () => {
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Alden Vale", tiles: 1, incomePerMinute: 265, techs: 0, score: 265, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 100, techs: 0, score: 100, rank: 2 }
    ];
    const liveEconomicHegemony = buildEconomicHegemonyObjective(leaderboardOverall);

    const result = seasonVictoryForBroadcast(cachedObjectives, undefined, liveEconomicHegemony, "player-1", 265);

    expect(result.find((o) => o.id === "ECONOMIC_HEGEMONY")?.selfProgressLabel).toBeUndefined();
  });
});

describe("selfProgressByPlayerId (numeric companion to selfProgressLabelsByPlayerId)", () => {
  it("computes a non-leader's own numeric TOWN_CONTROL progress, and omits the leader's own path", () => {
    // 4 total town tiles -> townTarget = ceil(4 * 0.5) = 2. player-1 (leader)
    // owns 1 (progress 0.5, surfaced on the objective itself, not this map);
    // player-2 owns 1 too but is not the leader (tie broken by id), so their
    // own numeric progress on TOWN_CONTROL should also be 0.5.
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "SETTLEMENT" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", townType: "SETTLEMENT" },
      { x: 2, y: 0, terrain: "LAND", townType: "SETTLEMENT" },
      { x: 3, y: 0, terrain: "LAND", townType: "SETTLEMENT" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 0, techs: 0, score: 0, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 0, techs: 0, score: 0, rank: 2 }
    ];
    const players: PlayersFixture = [
      { id: "player-1", allies: [] },
      { id: "player-2", allies: [] }
    ] as PlayersFixture;

    const { objectives, selfProgressByPlayerId } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    const townControl = objectives.find((o) => o.id === "TOWN_CONTROL");
    expect(townControl?.leaderPlayerId).toBe("player-1");
    expect(selfProgressByPlayerId.get("player-2")?.get("TOWN_CONTROL")).toBe(0.5);
    // The leader never gets an entry for a path they lead, same as the labels map.
    expect(selfProgressByPlayerId.get("player-1")?.has("TOWN_CONTROL")).toBe(false);
  });

  it("clamps every self-progress fraction to 0..1", () => {
    const worldTiles: WorldTileFixture[] = [
      { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", townType: "SETTLEMENT" },
      { x: 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", townType: "SETTLEMENT" }
    ] as WorldTileFixture[];
    const leaderboardOverall: LeaderboardFixture = [
      { id: "player-1", name: "Leader", tiles: 1, incomePerMinute: 0, techs: 0, score: 0, rank: 1 },
      { id: "player-2", name: "Runner Up", tiles: 1, incomePerMinute: 0, techs: 0, score: 0, rank: 2 }
    ];
    const players: PlayersFixture = [
      { id: "player-1", allies: [] },
      { id: "player-2", allies: [] }
    ] as PlayersFixture;

    const { selfProgressByPlayerId } = computeSeasonVictory(worldTiles, leaderboardOverall, players);
    for (const progresses of selfProgressByPlayerId.values()) {
      for (const value of progresses.values()) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("mergeSelfProgress", () => {
  const baseObjective = {
    id: "ECONOMIC_HEGEMONY" as const,
    name: "Economic Ascendancy",
    description: "Lead the world economy.",
    leaderName: "Leader",
    progressLabel: "10.0 gold/m vs 4.0",
    thresholdLabel: "Need at least 200 gold/m and 33% lead",
    holdDurationSeconds: 21600,
    statusLabel: "Pressure building",
    conditionMet: false
  };

  it("attaches the matching label when present", () => {
    const merged = mergeSelfProgress([baseObjective], new Map([["ECONOMIC_HEGEMONY", "4.0 gold/m"]]));
    expect(merged[0]?.selfProgressLabel).toBe("4.0 gold/m");
  });

  it("returns objectives unchanged when there are no labels for this player", () => {
    expect(mergeSelfProgress([baseObjective], undefined)).toEqual([baseObjective]);
    expect(mergeSelfProgress([baseObjective], new Map())).toEqual([baseObjective]);
  });
});
