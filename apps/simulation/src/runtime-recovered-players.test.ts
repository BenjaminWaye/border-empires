import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

describe("SimulationRuntime recovered-player fallback", () => {
  it("infers AI identity and default balances for recovered players missing legacy fields", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialState: {
        tiles: [{ x: 4, y: 4, terrain: "LAND", ownerId: "ai-3", ownershipState: "FRONTIER" }],
        activeLocks: [],
        players: [{ id: "ai-3" }]
      }
    });

    const recoveredPlayer = runtime.exportSnapshotSections().initialState.players.find((player) => player.id === "ai-3");
    expect(recoveredPlayer).toEqual(
      expect.objectContaining({
        id: "ai-3",
        isAi: true,
        points: 100,
        manpower: 150
      })
    );
  });

  it("backfills missing player rows from owned tile state so restart ownership remains addressable", () => {
    const runtime = new SimulationRuntime({
      now: () => 2_000,
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "ai-7", ownershipState: "FRONTIER" },
          { x: 10, y: 11, terrain: "LAND", ownerId: "user-auth-123", ownershipState: "FRONTIER" }
        ],
        activeLocks: [],
        players: []
      }
    });

    const players = runtime.exportSnapshotSections().initialState.players;
    expect(players).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: "ai-7", isAi: true }),
        expect.objectContaining({ id: "user-auth-123", isAi: false })
      ])
    );
  });
});
