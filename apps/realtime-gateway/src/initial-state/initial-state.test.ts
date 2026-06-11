import { describe, expect, it } from "vitest";

import { resolveInitialState } from "./initial-state.js";

describe("resolveInitialState", () => {
  it("prefers the authoritative simulation snapshot", () => {
    expect(
      resolveInitialState({
        playerId: "player-1",
        authoritativeSnapshot: { playerId: "player-1", tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1" }] },
        cachedSnapshot: { playerId: "player-1", tiles: [{ x: 0, y: 0, terrain: "LAND", ownerId: "player-2" }] },
        simulationSeedProfile: "default",
        allowCachedSnapshotFallback: false,
        allowSeedFallback: false
      })
    ).toEqual({
      playerId: "player-1",
      tiles: [{ x: 10, y: 10, terrain: "LAND", ownerId: "player-1" }]
    });
  });

  it("returns an empty snapshot when seed fallback is disabled and no authoritative tiles exist", () => {
    expect(
      resolveInitialState({
        playerId: "player-1",
        simulationSeedProfile: "default",
        allowCachedSnapshotFallback: false,
        allowSeedFallback: false
      })
    ).toEqual({
      playerId: "player-1",
      tiles: []
    });
  });

  it("preserves authoritative world status even when the bootstrap snapshot has no visible tiles", () => {
    expect(
      resolveInitialState({
        playerId: "player-1",
        authoritativeSnapshot: {
          playerId: "player-1",
          worldStatus: {
            leaderboard: {
              overall: [{ id: "ai-1", name: "Alden Vale", tiles: 1, incomePerMinute: 1, techs: 0, score: 4, rank: 1 }],
              byTiles: [{ id: "ai-1", name: "Alden Vale", value: 1, rank: 1 }],
              byIncome: [{ id: "ai-1", name: "Alden Vale", value: 1, rank: 1 }],
              byTechs: [{ id: "ai-1", name: "Alden Vale", value: 0, rank: 1 }]
            },
            seasonVictory: []
          },
          tiles: []
        },
        simulationSeedProfile: "season-20ai",
        allowCachedSnapshotFallback: false,
        allowSeedFallback: false
      })
    ).toEqual({
      playerId: "player-1",
      worldStatus: {
        leaderboard: {
          overall: [{ id: "ai-1", name: "Alden Vale", tiles: 1, incomePerMinute: 1, techs: 0, score: 4, rank: 1 }],
          byTiles: [{ id: "ai-1", name: "Alden Vale", value: 1, rank: 1 }],
          byIncome: [{ id: "ai-1", name: "Alden Vale", value: 1, rank: 1 }],
          byTechs: [{ id: "ai-1", name: "Alden Vale", value: 0, rank: 1 }]
        },
        seasonVictory: []
      },
      tiles: []
    });
  });

  it("uses cached snapshot only when non-authoritative fallback is enabled", () => {
    expect(
      resolveInitialState({
        playerId: "player-1",
        cachedSnapshot: { playerId: "player-1", tiles: [{ x: 3, y: 7, terrain: "LAND", ownerId: "player-1" }] },
        simulationSeedProfile: "default",
        allowCachedSnapshotFallback: true,
        allowSeedFallback: false
      })
    ).toEqual({
      playerId: "player-1",
      tiles: [{ x: 3, y: 7, terrain: "LAND", ownerId: "player-1" }]
    });
    expect(
      resolveInitialState({
        playerId: "player-1",
        cachedSnapshot: { playerId: "player-1", tiles: [{ x: 3, y: 7, terrain: "LAND", ownerId: "player-1" }] },
        simulationSeedProfile: "default",
        allowCachedSnapshotFallback: false,
        allowSeedFallback: false
      })
    ).toEqual({
      playerId: "player-1",
      tiles: []
    });
  });
});
