import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer } from "./runtime.test-helpers.js";

// Three docks in one network: dock-a (player-1's), dock-b (player-2's,
// player-1's ally), dock-c (the crossing target). A chain, not a full mesh:
// dock-a only links to dock-b, so player-1's own dock has no direct edge to
// the dock-c target — reaching it requires the allied-network fallback via
// dock-b, exercising findOwnedDockOriginForCrossing's ally-network path in
// apps/simulation/src/runtime/runtime-crossing.ts.
const buildAlliedDockRuntime = (allied: boolean) =>
  new SimulationRuntime({
    now: () => 1_000,
    seedTiles: new Map(),
    initialPlayers: new Map([
      [
        "player-1",
        buildPlayer("player-1", {
          points: 10_000,
          manpower: 10_000,
          allies: allied ? new Set(["player-2"]) : new Set<string>()
        })
      ],
      ["player-2", buildPlayer("player-2", { points: 10_000, manpower: 10_000 })]
    ]),
    initialState: {
      tiles: [
        { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", dockId: "dock-a" },
        { x: 50, y: 50, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", dockId: "dock-b" },
        { x: 90, y: 90, terrain: "LAND", dockId: "dock-c" }
      ],
      docks: [
        { dockId: "dock-a", tileKey: "10,10", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] },
        { dockId: "dock-b", tileKey: "50,50", pairedDockId: "dock-a", connectedDockIds: ["dock-a", "dock-c"] },
        { dockId: "dock-c", tileKey: "90,90", pairedDockId: "dock-b", connectedDockIds: ["dock-b"] }
      ],
      activeLocks: []
    }
  });

describe("allied dock-network crossing", () => {
  it("allows EXPAND from an ally's dock when the actor controls another dock in the same network", async () => {
    // player-1 submits from a stale/unowned origin (50,50, dock-b — owned by
    // ally player-2), targeting the linked dock-c tile. The runtime must
    // resolve the origin via the allied-dock-network fallback.
    const runtime = buildAlliedDockRuntime(true);
    const seen: string[] = [];
    runtime.onEvent((event) => seen.push(event.eventType));
    runtime.submitCommand({
      commandId: "cmd-allied-dock-expand",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 50, fromY: 50, toX: 90, toY: 90 })
    });
    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_ACCEPTED");
  });

  it("rejects the same crossing when the origin's owner is not an ally", async () => {
    // Sharing dock access is an alliance benefit, not a standing feature of
    // the dock network.
    const runtime = buildAlliedDockRuntime(false);
    const seen: string[] = [];
    runtime.onEvent((event) => seen.push(event.eventType));
    runtime.submitCommand({
      commandId: "cmd-unallied-dock-expand",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "EXPAND",
      payloadJson: JSON.stringify({ fromX: 50, fromY: 50, toX: 90, toY: 90 })
    });
    await Promise.resolve();
    expect(seen[0]).toBe("COMMAND_REJECTED");
  });
});
