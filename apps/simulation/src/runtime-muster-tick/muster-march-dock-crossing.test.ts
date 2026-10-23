import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { acceptedMusterMarchCommands, makePlayer } from "./muster-march-test-support.js";

// REGRESSION: MARCH measured the distance to its target with a land-only
// flood (buildTerrainDistanceField), so a target across water was never
// connected to the flag. Every tile on the flag's island fell back to the
// straight-line distance across the sea, which made the beach facing the
// target look closest: the march expanded onto the shore and stalled there
// instead of heading for the dock that actually crosses. The flood now follows
// dock links, so the route through the dock is the one it ranks.
//
// Island A is x 0..9, a one-tile strait of water at x = 10, island B is
// x 11..20. The flag sits at (8,2) on A, the target at (12,2) on B -- four
// tiles away in a straight line, but only reachable through the dock pair
// (8,8) <-> (11,8).
const buildRuntime = (ownedOnA: Array<[number, number]>) => {
  const owned = new Set(ownedOnA.map(([x, y]) => `${x},${y}`));
  const tiles: Array<Record<string, unknown>> = [];
  for (let x = 0; x <= 20; x += 1) {
    for (let y = 0; y <= 10; y += 1) {
      const key = `${x},${y}`;
      const base: Record<string, unknown> = { x, y, terrain: x === 10 ? "WATER" : "LAND", ownershipState: "FRONTIER" };
      if (key === "8,8") base.dockId = "dock-a";
      if (key === "11,8") base.dockId = "dock-b";
      if (owned.has(key)) Object.assign(base, { ownerId: "player-1", ownershipState: "SETTLED" });
      if (key === "8,2") base.muster = { ownerId: "player-1", amount: 60, mode: "MARCH", targetX: 12, targetY: 2, updatedAt: 1_000 };
      tiles.push(base);
    }
  }
  return new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
    seedTiles: new Map(),
    seedDocks: [
      { dockId: "dock-a", tileKey: "8,8", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "11,8", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ],
    initialState: { tiles: tiles as never, activeLocks: [] }
  });
};

const firstMarchCommand = (runtime: SimulationRuntime) => {
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => seen.push(event));
  runtime.tickMuster(1_000);
  const commands = acceptedMusterMarchCommands(seen);
  expect(commands).toHaveLength(1);
  return commands[0]!;
};

describe("muster MARCH across water", () => {
  it("crosses through an owned dock instead of expanding onto the beach facing the target", () => {
    const column: Array<[number, number]> = [2, 3, 4, 5, 6, 7, 8].map((y) => [8, y]);
    const command = firstMarchCommand(buildRuntime(column));
    expect(command.actionType).toBe("EXPAND");
    expect([command.targetX, command.targetY]).toEqual([11, 8]);
  });

  it("walks toward the dock when the flag's island has no owned crossing yet", () => {
    const command = firstMarchCommand(buildRuntime([[8, 2]]));
    expect(command.actionType).toBe("EXPAND");
    // One step south toward the dock at (8,8), not onto the beach at (9,2).
    expect(command.targetY).toBe(3);
  });
});
