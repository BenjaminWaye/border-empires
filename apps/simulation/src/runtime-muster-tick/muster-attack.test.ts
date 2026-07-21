import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";

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

// Seed an owned tile already carrying a muster reservoir at a given amount.
const buildRuntime = (originMuster: number, mode: "HOLD" | "ADVANCE" = "HOLD") =>
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
          muster: { ownerId: "player-1", amount: originMuster, mode, updatedAt: 1_000 }
        },
        { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
      ],
      activeLocks: []
    }
  });

const tileMuster = (runtime: SimulationRuntime, x: number, y: number) => {
  const tile = runtime.exportState().tiles.find((entry) => entry.x === x && entry.y === y);
  return tile?.musterJson ? JSON.parse(tile.musterJson) : undefined;
};

describe("muster-gated attacks", () => {
  it("allows an attack when the origin tile has enough muster, and spends it from the tile", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = buildRuntime(60);
      runtime.submitCommand({
        commandId: "muster-attack-ok",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const captured = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
      expect(captured?.ownerId).toBe("player-1");
      // Target is FRONTIER (undefended, no fort) — costs FRONTIER_ATTACK_MUSTER_COST
      // (15), not the full MUSTER_ATTACK_COST (60): 60 - 15 = 45.
      expect(tileMuster(runtime, 10, 10)?.amount).toBeCloseTo(45, 5);
      // The pool is unchanged by the strike (no manpowerDelta applied to pool).
      const player = runtime.exportPlayerDebugSnapshot().find((p) => p.id === "player-1")!;
      expect(player.manpower).toBeCloseTo(150, 0);
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("rejects an attack when the origin tile lacks muster", async () => {
    const runtime = buildRuntime(0);
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "muster-attack-short",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });
    await Promise.resolve();
    const rejected = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
        event.eventType === "COMMAND_REJECTED" && event.commandId === "muster-attack-short"
    );
    expect(rejected?.code).toBe("INSUFFICIENT_MUSTER");
    expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11)?.ownerId).toBe("player-2");
  });

  it("ADVANCE flag auto-fires at an adjacent enemy when affordable", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = buildRuntime(60, "ADVANCE");
      runtime.tickMuster(1_000);
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);
      const captured = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
      expect(captured?.ownerId).toBe("player-1");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("ADVANCE does not fire from a disconnected owned pocket — only fires along connected territory", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // Layout (no tile exists between the muster flag and the pocket):
      //
      //   (5,5)  player-1 muster/ADVANCE   — muster flag, no owned neighbors in the tile map
      //   (5,7)  player-1 SETTLED          — isolated pocket: no owned tile bridges (5,5)↔(5,7)
      //   (5,8)  player-2 FRONTIER         — only reachable from the pocket, not from (5,5)
      //
      // Old code: sweepAttackCandidates finds (5,8) at radius 4, then spots (5,7) as an
      // owned tile adjacent to it and fires from (5,7) — wrong, (5,7) is disconnected.
      // New code: BFS from (5,5) finds no owned neighbours (nothing in the tile map
      // touches (5,5)), exhausts immediately, and sets the empty cooldown — no attack.
      const runtime = new SimulationRuntime({
        now: () => 1_000,
        initialPlayers: new Map([
          ["player-1", makePlayer("player-1")],
          ["player-2", makePlayer("player-2")]
        ]),
        initialState: {
          tiles: [
            {
              x: 5,
              y: 5,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            { x: 5, y: 7, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
            { x: 5, y: 8, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });

      runtime.tickMuster(1_000);
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      // (5,8) must still be owned by player-2: the isolated pocket at (5,7) must not be used.
      const shouldNotCapture = runtime.exportState().tiles.find((t) => t.x === 5 && t.y === 8);
      expect(shouldNotCapture?.ownerId).toBe("player-2");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("two ADVANCE flags targeting the same enemy tile do not both fire — the second finds the target already locked", async () => {
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      // Two owned muster flags, both adjacent to the same enemy tile (10,11).
      const runtime = new SimulationRuntime({
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
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            {
              x: 11,
              y: 10,
              terrain: "LAND",
              ownerId: "player-1",
              ownershipState: "SETTLED",
              muster: { ownerId: "player-1", amount: 60, mode: "ADVANCE", updatedAt: 1_000 }
            },
            { x: 10, y: 11, terrain: "LAND", ownerId: "player-2", ownershipState: "FRONTIER" }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));

      runtime.tickMuster(1_000);
      await Promise.resolve();

      // Only one flag should have actually fired — the other should have skipped
      // the already-locked target instead of submitting a doomed ATTACK.
      const lockedRejections = seen.filter(
        (event): event is Extract<SimulationEvent, { eventType: "COMMAND_REJECTED" }> =>
          event.eventType === "COMMAND_REJECTED" && event.code === "LOCKED"
      );
      expect(lockedRejections).toHaveLength(0);

      vi.advanceTimersByTime(3_100);
      const captured = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
      expect(captured?.ownerId).toBe("player-1");
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });

  it("capturing a tile with a muster flag broadcasts the clear with the new owner attached, not a bare neutral delta", async () => {
    // Regression: the muster-clear broadcast fired on capture used to send
    // `{x, y, musterJson: ""}` with no ownerId/ownershipState over the
    // unfiltered "__broadcast__" channel, which made the captured tile look
    // neutral on clients that treat a tile-wide delta as authoritative.
    vi.useFakeTimers();
    const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const runtime = new SimulationRuntime({
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
              muster: { ownerId: "player-1", amount: 60, mode: "HOLD", updatedAt: 1_000 }
            },
            {
              x: 10,
              y: 11,
              terrain: "LAND",
              ownerId: "player-2",
              ownershipState: "FRONTIER",
              muster: { ownerId: "player-2", amount: 10, mode: "HOLD", updatedAt: 1_000 }
            }
          ],
          activeLocks: []
        }
      });
      const seen: SimulationEvent[] = [];
      runtime.onEvent((event) => seen.push(event));
      runtime.submitCommand({
        commandId: "muster-attack-flag",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK",
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      });
      await Promise.resolve();
      vi.advanceTimersByTime(3_100);

      const captured = runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 11);
      expect(captured?.ownerId).toBe("player-1");

      // The per-command delta buffer coalesces every TILE_DELTA_BATCH emitted
      // during lock resolution (including the muster-clear "broadcast") into
      // one flushed event, so find every delta entry for the captured tile
      // that clears the muster flag and assert none of them omit ownership.
      const musterClearDeltas = seen
        .filter((event): event is Extract<SimulationEvent, { eventType: "TILE_DELTA_BATCH" }> => event.eventType === "TILE_DELTA_BATCH")
        .flatMap((event) => event.tileDeltas)
        .filter((delta) => delta.x === 10 && delta.y === 11 && delta.musterJson === "");
      expect(musterClearDeltas.length).toBeGreaterThan(0);
      for (const delta of musterClearDeltas) {
        expect(delta.ownerId).toBe("player-1");
        expect(delta.ownershipState).toBe("FRONTIER");
      }
    } finally {
      randomSpy.mockRestore();
      vi.useRealTimers();
    }
  });
});
