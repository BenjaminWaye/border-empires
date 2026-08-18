import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";

type Seen = { eventType: string; commandId: string; playerId: string; code?: string; tileDeltas?: unknown[] };

describe("dev queue (server-durable)", () => {
  it("auto-dispatches a queued SETTLE as soon as a slot is free, with nothing sent for the actual SETTLE", async () => {
    const scheduledTasks: Array<{ delayMs: number; task: () => void }> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (delayMs, task) => {
        scheduledTasks.push({ delayMs, task });
      },
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          {
            x: 10,
            y: 9,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });
    const seen: Seen[] = [];
    runtime.onEvent((event) => seen.push(event as SimulationEvent as unknown as Seen));

    runtime.submitCommand({
      commandId: "enqueue-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "DEV_QUEUE_ENQUEUE",
      payloadJson: JSON.stringify({ x: 10, y: 10, tileKey: "10,10", kind: "SETTLE" })
    });
    await Promise.resolve();

    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "enqueue-1" }));
    // The queued SETTLE was dispatched immediately (a slot was free) without
    // the client ever sending a SETTLE command.
    expect(scheduledTasks).toHaveLength(1);
    expect(scheduledTasks[0]?.delayMs).toBe(60_000);

    scheduledTasks[0]!.task();

    expect(runtime.exportState().tiles).toContainEqual(
      expect.objectContaining({ x: 10, y: 10, ownerId: "player-1", ownershipState: "SETTLED" })
    );
  });

  it("rejects enqueue once the server cap is reached", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: () => {},
      initialState: {
        tiles: [
          ...[1, 2, 3].map((x) => ({ x, y: 0, terrain: "LAND" as const, ownerId: "player-1", ownershipState: "FRONTIER" as const })),
          {
            x: 2,
            y: 1,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const,
            town: { name: "Home", type: "FARMING" as const, populationTier: "SETTLEMENT" as const }
          }
        ],
        activeLocks: []
      }
    });
    const seen: Seen[] = [];
    runtime.onEvent((event) => seen.push(event as SimulationEvent as unknown as Seen));

    // Occupy all 3 development slots first so every subsequent enqueue stays
    // queued instead of instantly draining (developmentProcessLimit is 3).
    for (const [x, clientSeq] of [[1, 1], [2, 2], [3, 3]] as const) {
      runtime.submitCommand({
        commandId: `settle-blocker-${x}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x, y: 0 })
      });
    }
    const attempts = 21;
    for (let i = 0; i < attempts; i += 1) {
      runtime.submitCommand({
        commandId: `enqueue-${i}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 4 + i,
        issuedAt: 1_000,
        type: "DEV_QUEUE_ENQUEUE",
        payloadJson: JSON.stringify({ x: 100 + i, y: 0, tileKey: `${100 + i},0`, kind: "SETTLE" })
      });
    }
    for (let i = 0; i < attempts; i += 1) await Promise.resolve();

    const rejected = seen.filter((event) => event.eventType === "COMMAND_REJECTED" && event.code === "DEV_QUEUE_FULL");
    expect(rejected).toHaveLength(1);
    expect(rejected[0]?.commandId).toBe(`enqueue-${attempts - 1}`);
  });

  it("cancels a queued (not-yet-dispatched) entry", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: () => {},
      initialState: {
        tiles: [
          { x: 1, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 2, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 3, y: 1, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          { x: 4, y: 4, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER" },
          {
            x: 2,
            y: 2,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          }
        ],
        activeLocks: []
      }
    });
    const seen: Seen[] = [];
    runtime.onEvent((event) => seen.push(event as SimulationEvent as unknown as Seen));

    // Occupy all 3 development slots (developmentProcessLimit default) with
    // in-progress settlements so the next enqueued entry stays queued
    // (not immediately dispatched) long enough to cancel it.
    for (const [x, y, clientSeq] of [[1, 1, 1], [2, 1, 2], [3, 1, 3]] as const) {
      runtime.submitCommand({
        commandId: `settle-blocker-${x}`,
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq,
        issuedAt: 1_000,
        type: "SETTLE",
        payloadJson: JSON.stringify({ x, y })
      });
    }
    runtime.submitCommand({
      commandId: "enqueue-cancel-me",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 4,
      issuedAt: 1_000,
      type: "DEV_QUEUE_ENQUEUE",
      payloadJson: JSON.stringify({ x: 4, y: 4, tileKey: "4,4", kind: "SETTLE" })
    });
    runtime.submitCommand({
      commandId: "cancel-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 5,
      issuedAt: 1_000,
      type: "DEV_QUEUE_CANCEL",
      payloadJson: JSON.stringify({ tileKey: "4,4" })
    });
    for (let i = 0; i < 5; i += 1) await Promise.resolve();

    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "cancel-1" }));
    // Never dispatched as a SETTLE while queued -- no dev-queue-drain command
    // was emitted for tile 4,4.
    expect(seen.some((event) => event.commandId.includes("dev-queue-drain") && event.commandId.includes("4,4"))).toBe(false);
  });
});
