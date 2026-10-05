import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { COMBAT_LOCK_MS } from "@border-empires/shared";
import { SimulationRuntime } from "../runtime/runtime.js";
import { makePlayer } from "./muster-march-test-support.js";

// A tile an attack launched from is not combat-locked (only the tile being
// attacked is), so ADVANCE/MARCH flags may fire on an enemy launch tile, and
// may launch from a tile that already launched another attack. A tile that IS
// under attack stays off-limits, both as a target and as a launch tile.
const attackLock = (playerId: string, originKey: string, targetKey: string) => {
  const [originX, originY] = originKey.split(",").map(Number) as [number, number];
  const [targetX, targetY] = targetKey.split(",").map(Number) as [number, number];
  return {
    commandId: `${playerId}-attack`,
    playerId,
    actionType: "ATTACK" as const,
    originX, originY, targetX, targetY, originKey, targetKey,
    resolvesAt: 1_000 + COMBAT_LOCK_MS,
    source: "player" as const
  };
};

const buildRuntime = (mode: "ADVANCE" | "MARCH", lock: ReturnType<typeof attackLock>) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", makePlayer("player-1")],
      ["player-2", makePlayer("player-2")],
      ["player-3", makePlayer("player-3")]
    ]),
    initialState: {
      tiles: [
        {
          x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED",
          muster: { ownerId: "player-1", amount: 60, mode, ...(mode === "MARCH" ? { targetX: 10, targetY: 14 } : {}), updatedAt: 1_000 }
        },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" },
        { x: 10, y: 12, terrain: "LAND", ownerId: "player-3", ownershipState: "FRONTIER" }
      ],
      activeLocks: [lock]
    }
  });

const firedTargets = (mode: "ADVANCE" | "MARCH", lock: ReturnType<typeof attackLock>): string[] => {
  const runtime = buildRuntime(mode, lock);
  const seen: SimulationEvent[] = [];
  runtime.onEvent((event) => seen.push(event));
  runtime.tickMuster(1_000);
  return seen.flatMap((event) =>
    event.eventType === "COMMAND_ACCEPTED" && event.actionType === "ATTACK" && event.commandId.includes(`:muster-${mode.toLowerCase()}:`)
      ? [`${event.targetX},${event.targetY}`]
      : []
  );
};

describe.each(["ADVANCE", "MARCH"] as const)("%s flag and a pending enemy attack", (mode) => {
  it("fires on the tile the enemy attack launched from", () => {
    expect(firedTargets(mode, attackLock("player-2", "10,11", "10,12"))).toEqual(["10,11"]);
  });

  it("does not fire on a tile that is itself under attack", () => {
    expect(firedTargets(mode, attackLock("player-2", "10,12", "10,11"))).toEqual([]);
  });
});

describe.each(["ADVANCE", "MARCH"] as const)("%s flag and its own launch tile", (mode) => {
  it("fires from a tile that already launched one of our own attacks", () => {
    // (10,10) is the origin of our in-flight attack on player-3's (10,12)-side tile.
    expect(firedTargets(mode, attackLock("player-1", "10,10", "10,12"))).toEqual(["10,11"]);
  });

  it("does not fire from a tile that is itself under attack", () => {
    expect(firedTargets(mode, attackLock("player-2", "10,11", "10,10"))).toEqual([]);
  });
});
