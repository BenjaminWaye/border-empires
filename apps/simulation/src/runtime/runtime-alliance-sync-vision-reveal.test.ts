import { describe, expect, it } from "vitest";
import { SimulationRuntime } from "./runtime.js";
import { buildPlayer, collectEvents } from "./runtime.test-helpers.js";

// Split out of runtime.test.ts (already over the file-line cap) rather than
// added there -- see AGENTS.md's file-line-limit rule.
describe("SYNC_ALLIANCE vision reveal", () => {
  it("syncs gateway alliance changes into runtime player state and promptly reveals/fogs shared vision", async () => {
    const runtime = new SimulationRuntime({
      now: () => 1_000,
      initialPlayers: new Map([
        ["player-1", buildPlayer("player-1")],
        ["player-2", buildPlayer("player-2")]
      ]),
      seedTiles: new Map(),
      initialState: {
        tiles: [
          { x: 10, y: 10, terrain: "LAND", ownerId: "player-1", ownershipState: "SETTLED" },
          { x: 11, y: 10, terrain: "LAND", ownerId: "player-2", ownershipState: "SETTLED" }
        ],
        activeLocks: []
      }
    });
    const seen = collectEvents(runtime);

    runtime.submitCommand({
      commandId: "sync-alliance-1",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 1_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: true })
    });
    await Promise.resolve();

    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.allies).toEqual(["player-2"]);
    expect(runtime.exportState().players.find((player) => player.id === "player-2")?.allies).toEqual(["player-1"]);
    expect(seen).toContainEqual(
      expect.objectContaining({
        eventType: "PLAYER_MESSAGE",
        messageType: "SOCIAL_STATE_SYNCED"
      })
    );
    // Regression: syncAllianceChange only records vision transitions -- it
    // doesn't mutate any tile itself -- and those transitions are only ever
    // drained by simulation-service.ts's TILE_DELTA_BATCH handler. Without a
    // TILE_DELTA_BATCH emitted here, the newly-shared ally vision (and the
    // reveal of the ally's already-built structures) would silently wait on
    // some unrelated tile change elsewhere in the world before ever reaching
    // the client.
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "TILE_DELTA_BATCH", commandId: "sync-alliance-1" }));

    runtime.submitCommand({
      commandId: "sync-alliance-2",
      sessionId: "system-runtime:social",
      playerId: "player-1",
      clientSeq: 0,
      issuedAt: 2_000,
      type: "SYNC_ALLIANCE",
      payloadJson: JSON.stringify({ targetPlayerId: "player-2", allied: false })
    });
    await Promise.resolve();

    expect(runtime.exportState().players.find((player) => player.id === "player-1")?.allies).toEqual([]);
    expect(runtime.exportState().players.find((player) => player.id === "player-2")?.allies).toEqual([]);
    // Same reasoning applies in reverse: breaking an alliance revokes shared
    // vision and must promptly fog the ex-ally's territory client-side too.
    expect(seen).toContainEqual(expect.objectContaining({ eventType: "TILE_DELTA_BATCH", commandId: "sync-alliance-2" }));
  });
});
