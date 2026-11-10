import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { MUSTER_SAIL_MIN_MS, MUSTER_TRANSIT_MS_PER_TILE } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { makePlayer } from "../runtime-muster-tick/muster-march-test-support.js";

// REGRESSION: an ADVANCE flag's travel time was the straight-line distance
// from the flag to the launch tile, even when that line crossed the sea, and
// the client drew the company walking over the water. The company now marches
// to the dock, sails across and marches out, and the attack waits that long.
//
// Island A is x 0..9, a strait of water at x = 10, island B is x 11..20. The
// flag sits at (8,5) on A; player-1 holds a column down to the dock (8,8), the
// paired dock (11,8) and a column up B to (11,5), next to player-2's (12,4).
// Straight line flag -> launch tile: 3 tiles across the strait.
const buildRuntime = () => {
  const owned = new Set<string>();
  for (let y = 5; y <= 8; y += 1) owned.add(`8,${y}`);
  for (let y = 5; y <= 8; y += 1) owned.add(`11,${y}`);
  const tiles: Array<Record<string, unknown>> = [];
  for (let x = 0; x <= 20; x += 1) {
    for (let y = 0; y <= 10; y += 1) {
      const key = `${x},${y}`;
      const base: Record<string, unknown> = { x, y, terrain: x === 10 ? "SEA" : "LAND" };
      if (key === "8,8") base.dockId = "dock-a";
      if (key === "11,8") base.dockId = "dock-b";
      if (owned.has(key)) Object.assign(base, { ownerId: "player-1", ownershipState: "SETTLED" });
      if (key === "12,4") Object.assign(base, { ownerId: "player-2", ownershipState: "FRONTIER" });
      if (key === "8,5") base.muster = { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 };
      tiles.push(base);
    }
  }
  return new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    seedTiles: new Map(),
    seedDocks: [
      { dockId: "dock-a", tileKey: "8,8", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
      { dockId: "dock-b", tileKey: "11,8", pairedDockId: "dock-a", connectedDockIds: ["dock-a"] }
    ],
    initialState: { tiles: tiles as never, activeLocks: [] }
  });
};

describe("muster transit through a dock", () => {
  it("charges the march to the dock, the crossing and the march out, not the line over the sea", () => {
    const runtime = buildRuntime();
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.tickMuster(1_000);
    const accepted = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_ACCEPTED" }> =>
        event.eventType === "COMMAND_ACCEPTED" && event.actionType === "ATTACK"
    );
    expect(accepted).toBeDefined();
    expect([accepted!.originX, accepted!.originY]).toEqual([11, 5]);
    expect([accepted!.musterOriginX, accepted!.musterOriginY]).toEqual([8, 5]);
    const transitMs = accepted!.transitEndsAt! - 1_000;
    // The straight line was 3 tiles (6 s). Now: three tiles down to the dock,
    // at least two up from where the transport lands, plus the crossing.
    expect(transitMs).toBeGreaterThanOrEqual((3 + 2) * MUSTER_TRANSIT_MS_PER_TILE + MUSTER_SAIL_MIN_MS);
  });
});
