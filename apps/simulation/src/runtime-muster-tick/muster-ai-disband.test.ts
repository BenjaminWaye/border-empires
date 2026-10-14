import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.MUSTER_SYSTEM_ENABLED = "true";
});

import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "../runtime/runtime.js";
import { buildPlayer, collectEvents } from "../runtime/runtime.test-helpers.js";

// ai-1 owns (10,10) and (11,10); the flag sits on (11,10), next to (12,10).
const buildRuntime = (clock: { nowMs: number }, neighbor: { ownerId: string; ownershipState: "SETTLED" | "BARBARIAN" }) =>
  new SimulationRuntime({
    now: () => clock.nowMs,
    initialPlayers: new Map([
      ["ai-1", buildPlayer("ai-1", { isAi: true, manpower: 5_000 })],
      ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
    ]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
        { x: 11, y: 10, terrain: "LAND", ownerId: "ai-1", ownershipState: "SETTLED" },
        { x: 12, y: 10, terrain: "LAND", ...neighbor }
      ],
      activeLocks: []
    }
  });

const submit = async (runtime: SimulationRuntime, playerId: string, type: string, payload: Record<string, unknown>, seq: number) => {
  runtime.submitCommand({
    commandId: `${type}-${seq}`,
    sessionId: "session-1",
    playerId,
    clientSeq: seq,
    issuedAt: 1_000,
    type: type as "SET_MUSTER",
    payloadJson: JSON.stringify(payload)
  });
  await Promise.resolve();
};

const flagOn = (runtime: SimulationRuntime, x: number, y: number): string | undefined =>
  runtime.exportState().tiles.find((tile) => tile.x === x && tile.y === y)?.musterJson || undefined;

const plantFlagAndFill = async (runtime: SimulationRuntime, clock: { nowMs: number }) => {
  await submit(runtime, "ai-1", "SET_MUSTER", { x: 11, y: 10, mode: "HOLD" }, 1);
  expect(flagOn(runtime, 11, 10)).toBeDefined();
  clock.nowMs += 60_000;
  runtime.tickMuster(clock.nowMs);
  return JSON.parse(flagOn(runtime, 11, 10)!).amount as number;
};

const broadcastClears = (events: SimulationEvent[]) =>
  events.filter(
    (event) =>
      event.eventType === "TILE_DELTA_BATCH" &&
      event.playerId === "__broadcast__" &&
      event.tileDeltas.some((delta) => delta.x === 11 && delta.y === 10 && delta.musterJson === "")
  );

describe("AI muster flag disband", () => {
  it("disbands an AI flag and refunds its manpower once the enemy it faces signs a truce", async () => {
    const clock = { nowMs: 1_000 };
    const runtime = buildRuntime(clock, { ownerId: "player-2", ownershipState: "SETTLED" });
    const seen = collectEvents(runtime);
    const staged = await plantFlagAndFill(runtime, clock);
    expect(staged).toBeGreaterThan(0);

    await submit(runtime, "ai-1", "SYNC_TRUCE", { targetPlayerId: "player-2", truced: true }, 2);
    const poolBefore = runtime.exportState().players.find((player) => player.id === "ai-1")!.manpower;
    clock.nowMs += 30_000;
    runtime.tickMuster(clock.nowMs);

    expect(flagOn(runtime, 11, 10)).toBeUndefined();
    const poolAfter = runtime.exportState().players.find((player) => player.id === "ai-1")!.manpower;
    expect(poolAfter).toBeGreaterThanOrEqual(poolBefore + staged - 0.01);
    // The truce partner sees the flag go away too, not only the AI.
    expect(broadcastClears(seen)).toHaveLength(1);
  });

  it("keeps the AI flag while the enemy player is still hostile", async () => {
    const clock = { nowMs: 1_000 };
    const runtime = buildRuntime(clock, { ownerId: "player-2", ownershipState: "SETTLED" });
    await plantFlagAndFill(runtime, clock);
    clock.nowMs += 30_000;
    runtime.tickMuster(clock.nowMs);
    expect(flagOn(runtime, 11, 10)).toBeDefined();
  });

  it("keeps an AI flag up while barbarians are still in reach -- ADVANCE still attacks them", async () => {
    const clock = { nowMs: 1_000 };
    const runtime = buildRuntime(clock, { ownerId: "barbarian-1", ownershipState: "BARBARIAN" });
    await submit(runtime, "ai-1", "SET_MUSTER", { x: 11, y: 10, mode: "HOLD" }, 1);
    clock.nowMs += 30_000;
    runtime.tickMuster(clock.nowMs);
    expect(flagOn(runtime, 11, 10)).toBeDefined();
  });

  it("disbands an AI flag with nothing at all left to attack", async () => {
    const clock = { nowMs: 1_000 };
    const runtime = buildRuntime(clock, { ownerId: "ai-1", ownershipState: "SETTLED" });
    await submit(runtime, "ai-1", "SET_MUSTER", { x: 11, y: 10, mode: "HOLD" }, 1);
    clock.nowMs += 30_000;
    runtime.tickMuster(clock.nowMs);
    expect(flagOn(runtime, 11, 10)).toBeUndefined();
  });

  it("leaves a human's flag alone after a truce -- disbanding it is the player's call", async () => {
    const clock = { nowMs: 1_000 };
    const runtime = new SimulationRuntime({
      now: () => clock.nowMs,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 5_000 })],
        ["player-2", buildPlayer("player-2", { manpower: 5_000 })]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 12, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    await submit(runtime, "player-1", "SET_MUSTER", { x: 11, y: 10, mode: "HOLD" }, 1);
    await submit(runtime, "player-1", "SYNC_TRUCE", { targetPlayerId: "player-2", truced: true }, 2);
    clock.nowMs += 30_000;
    runtime.tickMuster(clock.nowMs);
    expect(flagOn(runtime, 11, 10)).toBeDefined();
  });
});
