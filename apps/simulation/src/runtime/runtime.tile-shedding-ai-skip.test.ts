import { describe, expect, it } from "vitest";

import { SimulationRuntime } from "./runtime.js";

// Regression for the 2026-07-05 staging incident: the tile-shedding tick
// unconditionally called emitPlayerStateUpdate after shedding a bankrupt
// player's tile, forcing a full economy-snapshot + town-network rebuild
// (cachedEconomySnapshot is invalidated on every replaceTileState) even for
// AI players with no WS subscriber to receive the resulting PLAYER_UPDATE.
// Measured 1123ms (economy) + 880ms (nested town-network BFS) on a
// ~1918-tile/13-town AI empire — one of two blockers behind spurious human
// SIMULATION_UNAVAILABLE. Matches the established precedent from PR #732
// (same skip, applied at lock resolution instead of the shed tick).
const makePlayer = (id: string, isAi: boolean) => [
  id,
  {
    id,
    isAi,
    points: 0,
    manpower: 100,
    techIds: new Set<string>(),
    domainIds: new Set<string>(),
    mods: { attack: 1, defense: 1, income: 1, vision: 1 },
    techRootId: "rewrite-local",
    allies: new Set<string>()
  }
] as const;

describe("simulation runtime — tile shedding skips PLAYER_UPDATE for AI players", () => {
  it("skips emitPlayerStateUpdate (and fires the skip callback) when the shed player is AI", async () => {
    let now = 1_000;
    let skippedCount = 0;
    const skippedPlayerIds: string[] = [];
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([makePlayer("ai-1", true)]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" }],
        activeLocks: []
      },
      onPlayerStateUpdateSkippedAi: (playerId) => {
        skippedCount += 1;
        skippedPlayerIds.push(playerId);
      }
    });

    const events: Array<{ eventType: string; messageType?: string }> = [];
    runtime.onEvent((event) => events.push(event as { eventType: string; messageType?: string }));

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    // The shed itself still happens and is still broadcast.
    const tileDeltaBatches = events.filter((e) => e.eventType === "TILE_DELTA_BATCH");
    expect(tileDeltaBatches.length).toBeGreaterThan(0);

    // But no PLAYER_UPDATE was emitted for the AI player — nothing consumes it.
    const playerUpdates = events.filter((e) => e.eventType === "PLAYER_MESSAGE" && e.messageType === "PLAYER_UPDATE");
    expect(playerUpdates.length).toBe(0);

    expect(skippedCount).toBe(1);
    expect(skippedPlayerIds).toEqual(["ai-1"]);
  });

  it("still emits PLAYER_UPDATE (and never fires the skip callback) when the shed player is human", async () => {
    let now = 1_000;
    let skippedCount = 0;
    const runtime = new SimulationRuntime({
      now: () => now,
      initialPlayers: new Map([makePlayer("human-1", false)]),
      seedTiles: new Map(),
      initialState: {
        tiles: [{ x: 0, y: 0, terrain: "LAND", ownerId: "human-1", ownershipState: "SETTLED" }],
        activeLocks: []
      },
      onPlayerStateUpdateSkippedAi: () => {
        skippedCount += 1;
      }
    });

    const events: Array<{ eventType: string; messageType?: string }> = [];
    runtime.onEvent((event) => events.push(event as { eventType: string; messageType?: string }));

    now = 60_000;
    await runtime.tickTileShedding(60_000);

    const playerUpdates = events.filter((e) => e.eventType === "PLAYER_MESSAGE" && e.messageType === "PLAYER_UPDATE");
    expect(playerUpdates.length).toBeGreaterThan(0);
    expect(skippedCount).toBe(0);
  });
});
