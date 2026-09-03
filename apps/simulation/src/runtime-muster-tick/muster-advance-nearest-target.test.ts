import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import { SimulationRuntime } from "../runtime/runtime.js";
import type { RecoveredSimulationState } from "../event-recovery/event-recovery.js";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { ADVANCE_MAX_RANGE_TILES } from "./muster-auto-fire-shared.js";

type SeedTileInput = RecoveredSimulationState["tiles"][number];

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

const runtimeWithTiles = (tiles: SeedTileInput[]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")]
    ]),
    initialState: { tiles, activeLocks: [] }
  });

describe("ADVANCE auto-fire target selection", () => {
  it("fires at the geometrically nearest attackable enemy, not whichever BFS reaches first", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // Flag at (50,50). Two owned neighbours, B=(49,50) and A=(51,50), both one
      // BFS hop from the flag. B is enumerated (and so dequeued/processed) before
      // A, and B's only attackable neighbour, EB=(48,50), sits two tiles from the
      // flag. A's attackable neighbour, EA=(50,51), sits only one tile from the
      // flag (diagonal to A) — the true nearest target. The old "stop at first
      // BFS hit" algorithm would fire on EB just because B was dequeued first;
      // the fix must pick EA instead.
      const runtime = runtimeWithTiles([
        {
          x: 50,
          y: 50,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
        },
        { x: 49, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 51, y: 50, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 48, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
        { x: 50, y: 51, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ]);

      runtime.tickMuster(1_000);
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const nearTarget = runtime.exportState().tiles.find((t) => t.x === 50 && t.y === 51);
      const farTarget = runtime.exportState().tiles.find((t) => t.x === 48 && t.y === 50);
      expect(nearTarget?.ownerId).toBe("player-1");
      expect(farTarget?.ownerId).toBe("player-2");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("idles instead of striking an enemy tile beyond ADVANCE_MAX_RANGE_TILES when nothing closer is reachable", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // A straight chain of owned tiles running past the hard range cap, with the
      // only attackable enemy tile sitting just beyond it. The flag should idle
      // (empty cooldown) rather than fire across the whole map at the one
      // reachable-but-far target.
      const chainLength = ADVANCE_MAX_RANGE_TILES + 5;
      const tiles: SeedTileInput[] = [
        {
          x: 0,
          y: 0,
          terrain: "LAND",
          ownerId: "player-1",
          ownershipState: "SETTLED",
          muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
        }
      ];
      for (let x = 1; x <= chainLength; x += 1) {
        tiles.push({ x, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" });
      }
      tiles.push({ x: chainLength + 1, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" });

      const runtime = runtimeWithTiles(tiles);
      runtime.tickMuster(1_000);
      await Promise.resolve();
      vi.advanceTimersByTime(COMBAT_LOCK_MS + 100);

      const farTarget = runtime.exportState().tiles.find((t) => t.x === chainLength + 1 && t.y === 0);
      expect(farTarget?.ownerId).toBe("player-2");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
