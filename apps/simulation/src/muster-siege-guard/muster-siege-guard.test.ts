import { afterEach, describe, expect, it, vi } from "vitest";
import { COMBAT_LOCK_MS, COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE, MUSTER_UNDER_SIEGE_MESSAGE } from "@border-empires/shared";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// A muster flag whose tile an enemy is attacking is "under siege": its troops
// are pinned until that fight resolves. Regression for staging 2026-10-19,
// where a player's queued attack fired from their besieged flag and came back
// as a bare "the tile is already in combat".
//
// Layout (x,y):  (10,9) p1 ---- (11,9) p2
//                (10,10) p1 FLAG <-- attacked from (10,11) p2
const muster = (ownerId: string) => ({ ownerId, amount: 999, mode: "HOLD" as const, updatedAt: 0 });

const siegeLock = {
  commandId: "p2-siege",
  playerId: "player-2",
  actionType: "ATTACK" as const,
  originX: 10,
  originY: 11,
  targetX: 10,
  targetY: 10,
  originKey: "10,11",
  targetKey: "10,10",
  resolvesAt: 1_000 + COMBAT_LOCK_MS
};

const buildRuntime = (activeLocks: (typeof siegeLock)[]) =>
  new SimulationRuntime({
    now: () => 1_000,
    initialPlayers: new Map([
      ["player-1", buildPlayer("player-1", { manpower: 1_000 })],
      ["player-2", buildPlayer("player-2", { manpower: 1_000 })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", muster: muster("player-1") },
        { x: 10, y: 9, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
        { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", afc: { ownerId: "player-1", status: "active", activatedAt: 0 } },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
        { x: 11, y: 9, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      activeLocks
    }
  });

const command = (commandId: string, type: string, payload: Record<string, unknown>) => ({
  commandId,
  sessionId: "session-1",
  playerId: "player-1",
  clientSeq: 1,
  issuedAt: 1_000,
  type: type as "SET_MUSTER",
  payloadJson: JSON.stringify(payload)
});

const rejection = (seen: SimulationEvent[], commandId: string): { code: string; message: string } | undefined => {
  for (const event of seen) {
    if (event.eventType === "COMMAND_REJECTED" && event.commandId === commandId) return { code: event.code, message: event.message };
  }
  return undefined;
};

const flagAt = (runtime: SimulationRuntime) =>
  runtime.exportState().tiles.find((tile) => tile.x === 10 && tile.y === 10)?.musterJson;

describe("muster flag under siege", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses CLEAR_MUSTER so the troops can't be pulled out before the tile falls", async () => {
    const runtime = buildRuntime([siegeLock]);
    const seen = collectEvents(runtime);
    runtime.submitCommand(command("clear", "CLEAR_MUSTER", { x: 10, y: 10 }));
    await Promise.resolve();
    expect(rejection(seen, "clear")).toEqual({ code: "MUSTER_UNDER_SIEGE", message: MUSTER_UNDER_SIEGE_MESSAGE });
    expect(flagAt(runtime)).toBeTruthy();
  });

  it("refuses Advance and March but still allows Hold", async () => {
    const runtime = buildRuntime([siegeLock]);
    const seen = collectEvents(runtime);
    runtime.submitCommand(command("advance", "SET_MUSTER", { x: 10, y: 10, mode: "ADVANCE" }));
    runtime.submitCommand(command("march", "SET_MUSTER", { x: 10, y: 10, mode: "MARCH", targetX: 12, targetY: 10 }));
    runtime.submitCommand(command("hold", "SET_MUSTER", { x: 10, y: 10, mode: "HOLD" }));
    await Promise.resolve();
    expect(rejection(seen, "advance")?.code).toBe("MUSTER_UNDER_SIEGE");
    expect(rejection(seen, "march")?.code).toBe("MUSTER_UNDER_SIEGE");
    expect(rejection(seen, "hold")).toBeUndefined();
  });

  it("allows CLEAR_MUSTER when nothing is attacking the flag's tile", async () => {
    const runtime = buildRuntime([]);
    const seen = collectEvents(runtime);
    runtime.submitCommand(command("clear", "CLEAR_MUSTER", { x: 10, y: 10 }));
    await Promise.resolve();
    expect(rejection(seen, "clear")).toBeUndefined();
    expect(flagAt(runtime)).toBeFalsy();
  });

  it("says the launch tile is under attack when attacking from the besieged flag", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime([siegeLock]);
    const seen = collectEvents(runtime);
    runtime.submitCommand({ ...command("attack", "ATTACK", { fromX: 10, fromY: 10, toX: 11, toY: 9 }), type: "ATTACK" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rejection(seen, "attack")).toEqual({ code: "LOCKED", message: COMBAT_LOCK_ORIGIN_UNDER_ATTACK_MESSAGE });
  });

  it("won't fund an attack from a besieged flag via a free neighbouring launch tile", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime([siegeLock]);
    const seen = collectEvents(runtime);
    // (10,9) is free and borders (11,9), but its only funding flag (10,10) is pinned.
    runtime.submitCommand({ ...command("attack", "ATTACK", { fromX: 10, fromY: 9, toX: 11, toY: 9 }), type: "ATTACK" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rejection(seen, "attack")?.code).toBe("INSUFFICIENT_MUSTER");
  });

  it("funds that same attack once the flag is not besieged", async () => {
    vi.useFakeTimers();
    const runtime = buildRuntime([]);
    const seen = collectEvents(runtime);
    runtime.submitCommand({ ...command("attack", "ATTACK", { fromX: 10, fromY: 9, toX: 11, toY: 9 }), type: "ATTACK" });
    await vi.advanceTimersByTimeAsync(0);
    expect(rejection(seen, "attack")).toBeUndefined();
  });
});
