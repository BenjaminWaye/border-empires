import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { COMBAT_LOCK_MS, MUSTER_TRANSIT_MS_PER_TILE } from "@border-empires/shared";

const RESOLVE_MS = COMBAT_LOCK_MS + MUSTER_TRANSIT_MS_PER_TILE;

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 150,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

const buildRuntime = (mode: "ADVANCE" | "MARCH") =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: {
      tiles: [
        {
          x: 10,
          y: 10,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          muster: {
            ownerId: "player-1",
            amount: 60,
            mode,
            updatedAt: 1_000,
            ...(mode === "MARCH" ? { targetX: 10, targetY: 12 } : {})
          }
        },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
        { x: 10, y: 12, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      activeLocks: []
    }
  });

const musterStatusCount = (events: SimulationEvent[]): number =>
  events.filter(
    (event) => event.eventType === "TILE_DELTA_BATCH" && event.commandId.startsWith("muster-status:")
  ).length;

// A muster flag whose in-flight lock is overdue (resolvesAt already in the
// past, but the lock has not been cleared) must not re-emit its status every
// tick. Pre-fix the in-flight branch clamped nextActionAt to
// Math.max(resolvesAt, nowMs), so the value changed on every tick, defeating
// syncMusterStatus's equality guard and persisting a TILE_DELTA_BATCH event
// per tick per stuck flag -- an unbounded SQLite write flood that blocked the
// sim event loop and stalled logins in prod.
describe.each(["ADVANCE", "MARCH"] as const)("%s muster status with an overdue in-flight lock", (mode) => {
  it("stops emitting status deltas once the status has settled", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = buildRuntime(mode);
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      // Launch the attack, which installs the in-flight lock.
      runtime.tickMuster(1_000);
      await Promise.resolve();

      // Tick once past the lock's resolvesAt without advancing the fake
      // timers, so the lock stays active but overdue -- exactly the stuck
      // state observed in prod. This tick may legitimately emit one status
      // delta as the flag settles into "in flight".
      runtime.tickMuster(1_000 + RESOLVE_MS + 5_000);
      await Promise.resolve();
      const settled = musterStatusCount(seen);

      // Every subsequent overdue tick must be a no-op.
      for (let i = 1; i <= 10; i += 1) {
        runtime.tickMuster(1_000 + RESOLVE_MS + 5_000 + i * 1_000);
        await Promise.resolve();
      }

      expect(musterStatusCount(seen)).toBe(settled);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
