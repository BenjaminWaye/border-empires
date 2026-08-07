import { describe, expect, it } from "vitest";
import type { SimulationEvent } from "@border-empires/sim-protocol";
import { SimulationRuntime } from "./runtime.js";
import { buildAiOpponent, buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// §14.2: dormant/unpowered structure indicator. Runtime.dormantStructuresForPlayer
// (and the PLAYER_UPDATE payload it feeds) is what threads §5.4's existing
// per-structure dormancy computation onto the wire for the client — see
// docs/manpower-economy-rewrite-plan.md §14.2 and dormantStructureDetailsFromDormancy
// in resource-slot-view.ts for the pure-function unit coverage of the detail
// shape itself. These tests cover the Runtime-level wiring: the right
// structures show up, with the right resource(s), on the live PLAYER_UPDATE
// message.
describe("§14.2 dormant structures wire field", () => {
  it("dormantStructuresForPlayer lists a dormant Fort with the resource it's short on", () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000 })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", activatedAt: 100 }
          },
          {
            x: 1,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", activatedAt: 200 }
          },
          // Exactly 1 IRON slot: two Forts demand 2, supply is 1 — the newer
          // one (activatedAt 200, per §5.4's tie-break) goes dormant, sparing
          // the older one.
          { x: 3, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "IRON" }
        ],
        activeLocks: []
      }
    });
    expect(runtime.dormantStructuresForPlayer("player-1")).toEqual([{ key: "1,0:fort", resources: ["IRON"] }]);
    expect(runtime.dormantStructuresForPlayer("player-2")).toEqual([]);
  });

  it("PLAYER_UPDATE carries dormantStructures alongside resourceSlots", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1", { manpower: 10_000, points: 20_000 })],
        ["player-2", buildAiOpponent()]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            fort: { ownerId: "player-1", status: "active", activatedAt: 100 }
          },
          // No IRON supply tile: the Fort's own 1 IRON slot demand is unmet.
          // A separate town tile with an explicit goldPerMinute so
          // COLLECT_TILE (elsewhere on the empire) always has real yield to
          // collect and therefore always reaches emitPlayerStateUpdate.
          {
            x: 2,
            y: 2,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            town: { name: "Alpha", type: "MARKET", populationTier: "SETTLEMENT", goldPerMinute: 1 }
          }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);
    runtime.submitCommand({
      commandId: "collect-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "COLLECT_TILE",
      payloadJson: JSON.stringify({ x: 2, y: 2 })
    });
    await Promise.resolve();
    const playerUpdateEvent = seen.find(
      (event): event is Extract<SimulationEvent, { eventType: "PLAYER_MESSAGE" }> =>
        event.eventType === "PLAYER_MESSAGE" && event.messageType === "PLAYER_UPDATE"
    );
    expect(playerUpdateEvent).toBeDefined();
    const payload = JSON.parse(playerUpdateEvent!.payloadJson) as {
      dormantStructures: Array<{ key: string; resources: string[] }>;
    };
    expect(payload.dormantStructures).toEqual([{ key: "0,0:fort", resources: ["IRON"] }]);
  });
});
