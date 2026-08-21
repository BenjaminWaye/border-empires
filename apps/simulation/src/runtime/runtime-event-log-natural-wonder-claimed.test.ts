import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// The "Recent Events" durable per-player log gets a NATURAL_WONDER_CLAIMED
// entry every time a human player claims a natural wonder tile — mirrors
// TOWN_LOST/MONUMENT_CLAIMED (see runtime-natural-wonders.ts's
// announceNaturalWonderClaim).
describe("event log — natural wonder claimed", () => {
  it("appends a NATURAL_WONDER_CLAIMED entry with the wonder's flavor text and boon", async () => {
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000 })]]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" }
          },
          { x: 1, y: 0, terrain: "LAND", naturalWonder: { type: "FOUNDRY_HEART" } }
        ] as never,
        activeLocks: []
      }
    });
    runtime.submitCommand({
      commandId: "expand-wonder",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    });
    await Promise.resolve();
    for (const task of scheduledTasks.splice(0)) task();
    const player = runtime.exportState().players.find((p) => p.id === "player-1");
    expect(player?.eventLog?.[0]).toMatchObject({
      type: "NATURAL_WONDER_CLAIMED",
      text: expect.stringContaining("Foundry Heart"),
      x: 1,
      y: 0
    });
    expect(player?.eventLog?.[0]?.text).toContain("+1 slot for FOOD, TITANIUM, CRYSTAL, and UMBRITE");
  });

  it("does not append an event-log entry when the claimer is AI", async () => {
    const scheduledTasks: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => { scheduledTasks.push(task); },
      initialPlayers: new Map([["player-1", buildPlayer("player-1", { isAi: true, points: 10_000, manpower: 10_000 })]]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 1, y: 0, terrain: "LAND", naturalWonder: { type: "FOUNDRY_HEART" } }
        ] as never,
        activeLocks: []
      }
    });
    runtime.submitCommand({
      commandId: "expand-wonder",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 0, fromY: 0, toX: 1, toY: 0 })
    });
    await Promise.resolve();
    for (const task of scheduledTasks.splice(0)) task();
    const player = runtime.exportState().players.find((p) => p.id === "player-1");
    expect(player?.eventLog ?? []).toHaveLength(0);
  });
});
