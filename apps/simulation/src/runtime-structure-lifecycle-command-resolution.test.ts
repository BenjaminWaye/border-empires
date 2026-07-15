import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime/runtime.js";

const makePlayer = (id: string) => ({
  id,
  isAi: false,
  points: 10_000,
  manpower: 10_000,
  techIds: new Set<string>(),
  domainIds: new Set<string>(),
  mods: { attack: 1, defense: 1, income: 1, vision: 1 },
  techRootId: "rewrite-local",
  allies: new Set<string>()
});

// Regression for 5000+ permanently-QUEUED commands found in production (root
// cause of a 2026-07-15 staging crash loop, and plausibly of "removed
// structures reappearing after restart"): every handler in
// runtime-structure-lifecycle-command-handlers.ts is an "instant" command
// (no combat lock) whose success path previously only emitted TILE_DELTA_BATCH,
// which persistCommandStatus doesn't recognize as terminal — so the command's
// persisted status never left QUEUED, and it was fully re-recovered and
// re-executed on every restart against whatever the tile's CURRENT state
// happened to be by then (e.g. a stale CANCEL_STRUCTURE_BUILD replay could
// revert an unrelated, later removal-in-progress back to "active").
describe("runtime-structure-lifecycle-command-handlers COMMAND_RESOLVED regression", () => {
  const findResolved = (seen: SimulationEvent[], commandId: string): SimulationEvent | undefined =>
    seen.find((event) => event.eventType === "COMMAND_RESOLVED" && event.commandId === commandId);

  it("CANCEL_FORT_BUILD emits COMMAND_RESOLVED on success", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "under_construction", completesAt: 2_000 }
          }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "cancel-fort-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CANCEL_FORT_BUILD",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();
    expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson).toBeUndefined();
    expect(findResolved(seen, "cancel-fort-1")).toEqual({ eventType: "COMMAND_RESOLVED", commandId: "cancel-fort-1", playerId: "player-1" });
  });

  it("CANCEL_STRUCTURE_BUILD emits COMMAND_RESOLVED on success", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "under_construction", completesAt: 2_000 }
          }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "cancel-structure-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CANCEL_STRUCTURE_BUILD",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();
    expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.fortJson).toBeUndefined();
    expect(findResolved(seen, "cancel-structure-1")).toEqual({
      eventType: "COMMAND_RESOLVED",
      commandId: "cancel-structure-1",
      playerId: "player-1"
    });
  });

  it("CANCEL_SIEGE_OUTPOST_BUILD emits COMMAND_RESOLVED on success", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            siegeOutpost: { ownerId: "player-1", status: "under_construction", completesAt: 2_000 }
          }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "cancel-siege-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CANCEL_SIEGE_OUTPOST_BUILD",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();
    expect(runtime.exportState().tiles.find((t) => t.x === 10 && t.y === 10)?.siegeOutpostJson).toBeUndefined();
    expect(findResolved(seen, "cancel-siege-1")).toEqual({
      eventType: "COMMAND_RESOLVED",
      commandId: "cancel-siege-1",
      playerId: "player-1"
    });
  });

  it("REMOVE_STRUCTURE emits COMMAND_RESOLVED for the original command immediately (not only on later completion)", async () => {
    const scheduled: Array<() => void> = [];
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      scheduleAfter: (_delayMs, task) => {
        scheduled.push(task);
      },
      initialPlayers: new Map([["player-1", makePlayer("player-1")]]),
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active" }
          }
        ],
        activeLocks: []
      }
    });
    const seen: SimulationEvent[] = [];
    runtime.onEvent((event) => seen.push(event));
    runtime.submitCommand({
      commandId: "remove-structure-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "REMOVE_STRUCTURE",
      payloadJson: JSON.stringify({ x: 10, y: 10 })
    });
    await Promise.resolve();
    // Resolved as soon as removal STARTS — the actual multi-minute completion
    // is tracked independently via completesAt on the tile (and re-scheduled
    // on boot recovery), not via command replay, so there's no need to keep
    // the original command non-terminal until the scheduled task fires.
    expect(findResolved(seen, "remove-structure-1")).toEqual({
      eventType: "COMMAND_RESOLVED",
      commandId: "remove-structure-1",
      playerId: "player-1"
    });
    expect(scheduled).toHaveLength(1);
  });
});
