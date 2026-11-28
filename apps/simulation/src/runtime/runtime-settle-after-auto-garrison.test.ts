import { describe, expect, it } from "vitest";
import { NEW_PLAYER_AUTO_SETTLE_PREFS } from "@border-empires/shared";
import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// First-15 playtest round 1 (pt-diplomat, pt-warlord, pt-predator): ticking
// "Garrison farm tiles automatically" and then tapping Garrison failed with
// "Action failed: tile is not one of your frontier tiles". The tick switched the
// category on, the server's auto-garrison settled the tile at once (a new
// player's first garrisons are instant), and the tap's SETTLE then found it
// SETTLED. The player got what they asked for, so the tap resolves.
let clientSeq = 0;
const command = (commandId: string, type: CommandEnvelope["type"], payload: unknown): CommandEnvelope => ({
  commandId, sessionId: "session-1", playerId: "player-1", clientSeq: ++clientSeq, issuedAt: 1_000, type, payloadJson: JSON.stringify(payload)
});

const setup = () => {
  const tasks: Array<() => void> = [];
  const runtime = new SimulationRuntime({
    now: () => 1_000,
    scheduleAfter: (_delayMs, task) => { tasks.push(task); },
    initialPlayers: new Map([["player-1", buildPlayer("player-1", { points: 10_000, manpower: 10_000, manpowerUpdatedAt: 1_000, autoSettle: { ...NEW_PLAYER_AUTO_SETTLE_PREFS, answered: true } })]]),
    seedTiles: new Map(),
    initialState: {
      tiles: [
        { x: 40, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", town: { name: "Home", type: "FARMING", populationTier: "TOWN" } },
        { x: 41, y: 40, terrain: "LAND", ownerId: "player-1", ownershipState: "FRONTIER", resource: "FARM" },
        { x: 50, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
      ],
      activeLocks: []
    }
  });
  const runAll = (): void => { while (tasks.length) tasks.shift()?.(); };
  return { runtime, seen: collectEvents(runtime), runAll };
};

const farmState = (runtime: SimulationRuntime) => runtime.exportState().tiles.find((tile) => tile.x === 41 && tile.y === 40)?.ownershipState;

describe("Garrison tapped after the auto-garrison got there first", () => {
  it("resolves instead of rejecting when the player's own auto-garrison already settled the tile", async () => {
    const { runtime, seen, runAll } = setup();
    runtime.submitCommand(command("prefs-1", "SET_AUTO_SETTLE_PREFS", { ...NEW_PLAYER_AUTO_SETTLE_PREFS, FARM: true }));
    await Promise.resolve();
    runAll();
    expect(farmState(runtime)).toBe("SETTLED");

    runtime.submitCommand(command("settle-1", "SETTLE", { x: 41, y: 40 }));
    await Promise.resolve();
    runAll();
    expect(seen).not.toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "settle-1" }));
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_RESOLVED", commandId: "settle-1", playerId: "player-1" }));
    // No second garrison started or charged.
    expect(seen.filter((event) => event.eventType === "SETTLEMENT_STARTED" && event.commandId === "settle-1")).toEqual([]);
  });

  it("still rejects a tile someone else owns", async () => {
    const { runtime, seen, runAll } = setup();
    runtime.submitCommand(command("settle-2", "SETTLE", { x: 50, y: 50 }));
    await Promise.resolve();
    runAll();
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "COMMAND_REJECTED", commandId: "settle-2", code: "SETTLE_INVALID" }));
  });
});
