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
 */
describe("unsettle downgrade broadcast", () => {
  it("emits a TILE_DELTA_BATCH for a rival's tile downgraded SETTLED -> FRONTIER by an overtaking reach anchor", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        [
          "player-1",
          buildPlayer("player-1", { points: 20_000, manpower: 10_000, techIds: new Set<string>(["navigation", "harborcraft"]), strategicResources: { CRYSTAL: 2_000 } })
        ],
        ["player-2", buildPlayer("player-2", { points: 500, manpower: 10_000 })]
      ]),
      initialState: {
        tiles: [
          { x: 0, y: 0, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", observatory: { ownerId: "player-1", status: "active" }, town: { name: "Home", type: "FARMING", populationTier: "SETTLEMENT" } },
          { x: 0, y: 1, terrain: "SEA" },
          { x: 0, y: 2, terrain: "SEA" },
          { x: 0, y: 3, terrain: "LAND" },
          // §5.4: CRYSTAL supply so the Observatory isn't dormant.
          { x: 20, y: 20, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED", resource: "GEMS" },
          // player-2's SETTLED tile, inside the bridge's landing radius but far
          // from player-2's own town -- so it has no live reach coverage there.
          { x: 0, y: 5, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" },
          { x: 300, y: 300, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED", town: { name: "Far", type: "FARMING", populationTier: "SETTLEMENT" } }
        ],
        activeLocks: []
      }
    });
    const events = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "bridge-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1_000,
      type: "CAST_AETHER_BRIDGE",
      payloadJson: JSON.stringify({ x: 0, y: 3 })
    });

    await Promise.resolve();

    expect(events.some((e) => e.eventType === "COMMAND_RESOLVED" && e.commandId === "bridge-1")).toBe(true);

    const tile = runtime.exportState().tiles.find((t) => t.x === 0 && t.y === 5);
    expect(tile?.ownershipState).toBe("FRONTIER");
    expect(tile?.ownerId).toBe("player-2");

    const unsettleBroadcast = events.find(
      (e) =>
        e.eventType === "TILE_DELTA_BATCH" &&
        e.tileDeltas.some((d) => d.x === 0 && d.y === 5 && d.ownershipState === "FRONTIER")
    );
    expect(unsettleBroadcast).toBeDefined();
  });
});
