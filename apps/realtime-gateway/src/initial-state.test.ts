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
        allowSeedFallback: false
      })
    ).toEqual({
      playerId: "player-1",
      tiles: []
    });
  });
});
