import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime/runtime.js";

describe("filterTileDeltasForPlayer ownership-clearing passthrough", () => {
  it("lets ownerId-cleared deltas through for non-visible tiles", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const cleared = { x: 50, y: 50, terrain: "LAND" as const };
    (cleared as Record<string, unknown>).ownerId = undefined;

    const deltas = [
      cleared as { x: number; y: number; terrain?: "LAND" | "SEA" | "COASTAL_SEA" | "MOUNTAIN" | undefined; ownerId?: string | undefined },
      { x: 60, y: 60, terrain: "LAND" as const },
      { x: 70, y: 70, terrain: "LAND" as const, ownerId: "player-2" as const, ownershipState: "SETTLED" as const }
    ];

    const filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1", { includeOwnershipClears: true });

    expect(filtered).toHaveLength(1);
    expect(filtered[0].x).toBe(50);
    expect(filtered[0].y).toBe(50);
    expect("ownerId" in filtered[0]).toBe(true);
    expect(filtered[0].ownerId).toBeUndefined();
    // The client can't tell a real sparse delta from a broadcast-only clear
    // stub once it's been through protobuf encode/decode (proto3 fills unset
    // scalars with defaults), so this marker must ride along explicitly.
    expect((filtered[0] as Record<string, unknown>).ownershipClearOnly).toBe(true);

    // Without the opt-in flag (e.g. survey sweep's "is this tile visible?"
    // check, or the bootstrap visible-state exporter), the original strict
    // "empty result == not visible" contract must be preserved.
    const filteredWithoutOptIn = runtime.filterTileDeltasForPlayer(deltas, "player-1");
    expect(filteredWithoutOptIn).toHaveLength(0);
  });

  it("does not set ownershipClearOnly on a normal visible delta", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const visibleDelta = { x: 10, y: 10, terrain: "LAND" as const, ownerId: "player-1" as const, ownershipState: "SETTLED" as const };

    const filtered = runtime.filterTileDeltasForPlayer([visibleDelta], "player-1", { includeOwnershipClears: true });

    expect(filtered).toHaveLength(1);
    expect((filtered[0] as Record<string, unknown>).ownershipClearOnly).toBeUndefined();
  });

  it("still drops ownerId-having deltas for non-visible tiles", () => {
    const runtime = new SimulationRuntime({
      now: () => 60_000,
      initialPlayers: new Map([
        [
          "player-1",
          {
            id: "player-1",
            isAi: false,
            points: 100,
            manpower: 100,
            techIds: new Set<string>(),
            domainIds: new Set<string>(),
            mods: { attack: 1, defense: 1, income: 1, vision: 1 },
            techRootId: "rewrite-local",
            allies: new Set<string>()
          }
        ]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });

    const deltas = [
      { x: 50, y: 50, terrain: "LAND" as const },
      { x: 60, y: 60, terrain: "LAND" as const, ownerId: "player-2" as const, ownershipState: "SETTLED" as const }
    ];

    const filtered = runtime.filterTileDeltasForPlayer(deltas, "player-1");

    expect(filtered).toHaveLength(0);
  });
});
