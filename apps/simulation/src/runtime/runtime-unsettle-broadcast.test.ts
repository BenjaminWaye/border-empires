import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

/**
 * Regression coverage for the SETTLED -> FRONTIER "unsettle" downgrade that
 * fires as a side effect of a rival's border push (settleOvertaken /
 * downgradeToFrontier in runtime-reach-border-apply.ts).
 *
 * That downgrade used to only mutate server-side tile state via
 * replaceTileState -- it never emitted a TILE_DELTA_BATCH for the
 * overtaken tile, so neither the tile's owner nor the player who just
 * overtook the border learned about the change until they clicked the tile
 * (forcing a fresh fetch) or reconnected. Reported symptom: "when the border
 * changed from another player to mine, his settled tiles converted to
 * frontier -- but this only showed once I pressed each individual tile."
 *
 * Triggered here by activating a Relay Beacon (OUTPOST_REACH_RADIUS = 5)
 * whose disk newly covers a rival's SETTLED tile that has no live reach
 * defending it -- not an Aether Bridge (its reach grant is a single tile,
 * radius 0, and never overtakes a tile another player actually owns; see
 * aether-bridge-reach.test.ts).
 */
describe("unsettle downgrade broadcast", () => {
  it("emits a TILE_DELTA_BATCH for a rival's tile downgraded SETTLED -> FRONTIER by an overtaking reach anchor", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000 })
        ],
        ["player-2", buildPlayer("player-2", { points: 500, manpower: 10_000 })]
      ]),
      initialState: {
        tiles: [
          {
            x: 0,
            y: 0,
            terrain: "LAND",
            ownerId: "player-1",
            ownershipState: "SETTLED",
            economicStructure: { ownerId: "player-1", type: "RELAY_BEACON", status: "inactive", inactiveReason: "manual" }
          },
          // Within OUTPOST_REACH_RADIUS (5) of the beacon, but far from
          // player-2's own town -- so it has no live reach coverage there.
          { x: 4, y: 0, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 300, y: 300, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Far", type: "FARMING", populationTier: "SETTLEMENT" } }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "enable-beacon",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "SET_CONVERTER_STRUCTURE_ENABLED",
      payloadJson: JSON.stringify({ x: 0, y: 0, enabled: true })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "enable-beacon")).toBe(true);

    const tile = runtime.exportState().tiles.find((t) => t.x === 4 && t.y === 0);
    expect(tile?.ownershipState).toBe("FRONTIER");
    expect(tile?.ownerId).toBe("player-2");

    const unsettleBroadcast = events.find(
      (e) =>
        e.eventType === "TILE_DELTA_BATCH" &&
        e.tileDeltas.some((d) => d.x === 4 && d.y === 0 && d.ownershipState === "FRONTIER")
    );
    expect(unsettleBroadcast).toBeDefined();
  });
});
