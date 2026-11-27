import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { afcModuleFixtureTile, buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// TOWN -> CITY widens the support ring from radius 1 to 2: the new outer plots
// must be claimed AND garrisoned (auto-settle "towns" switch), like the ring a
// fresh town garrison takes.
const started = (events: SimulationEvent[]): string[] =>
  events.filter((e): e is Extract<SimulationEvent, { eventType: "SETTLEMENT_STARTED" }> => e.eventType === "SETTLEMENT_STARTED").map((e) => e.tileKey);

describe("CITY upgrade garrisons the widened ring", () => {
  it("claims and starts garrisoning neutral ring-2 plots when a TOWN becomes a CITY", async () => {
    const ring1 = [] as Array<{ x: number; y: number; terrain: "LAND"; ownerId: string; ownershipState: "SETTLED" }>;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
      if (dx || dy) ring1.push({ x: 40 + dx, y: 40 + dy, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
    }
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 100_000, manpower: 10_000, manpowerUpdatedAt: 1_000 })]]),
      seedTiles: new Map(),
      initialState: {
        tiles: [afcModuleFixtureTile("player-1"),
          { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Hub", type: "FARMING", populationTier: "TOWN", population: 5_000_000 } },
          ...ring1,
          { x: 42, y: 40, terrain: "LAND" },
          { x: 38, y: 40, terrain: "LAND" },
          { x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 3, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" },
          { x: 4, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "FISH" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "upgrade-1", sessionId: "session-1", playerId: "player-1", clientSeq: 1, issuedAt: 1_000,
      type: "UPGRADE_TOWN_TIER", payloadJson: JSON.stringify({ x: 40, y: 40 })
    });
    await Promise.resolve();
    const rejected = seen.find((e) => e.eventType === "COMMAND_REJECTED");
    expect(rejected).toBeUndefined();
    const tiles = runtime.exportState().tiles;
    expect(tiles).toContainEqual(expect.objectContaining({ x: 42, y: 40, ownerId: "player-1" }));
    expect(started(seen)).toEqual(expect.arrayContaining(["42,40", "38,40"]));
  });
});
