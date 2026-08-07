import { describe, expect, it } from "vitest";

import { runDeterministicReplay } from "./deterministic-replay.js";

describe("runDeterministicReplay", () => {
  it("produces the same events and final state for the same command log", () => {
    const commands = [
      {
        commandId: "cmd-1",
        sessionId: "session-1",
        playerId: "player-1",
        clientSeq: 1,
        issuedAt: 1_000,
        type: "ATTACK" as const,
        payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
      }
    ];

    // Muster is unconditionally required to attack — merge-patch it onto the
    // default-seeded origin tile (10,10) rather than relying on the tick
    // (runDeterministicReplay never calls tickMuster, so it would never grow).
    const replayOptions = {
      startTime: 1_000,
      initialState: {
        tiles: [
          {
            x: 10,
            y: 10,
            terrain: "LAND" as const,
            ownerId: "player-1",
            ownershipState: "SETTLED" as const,
            muster: { ownerId: "player-1", amount: 999, mode: "HOLD" as const, updatedAt: 0 }
          }
        ],
        activeLocks: []
      }
    };
    const firstRun = runDeterministicReplay(commands, replayOptions);
    const secondRun = runDeterministicReplay(commands, replayOptions);

    // terrainEpoch is a per-runtime-instance counter used for caching, not
    // game state — different runtime instances naturally get different values.
    const { terrainEpoch: _f, ...firstFinal } = firstRun.finalState;
    const { terrainEpoch: _s, ...secondFinal } = secondRun.finalState;
    expect({ ...firstRun, finalState: firstFinal }).toEqual({ ...secondRun, finalState: secondFinal });
    const eventTypes = firstRun.events.map((event) => event.eventType);
    expect(eventTypes[0]).toBe("COMMAND_ACCEPTED");
    expect(eventTypes).toContain("COMBAT_RESOLVED");
    expect(eventTypes).toContain("TILE_DELTA_BATCH");
    expect(firstRun.finalState.tiles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          x: 10,
          y: 11,
          ownerId: "player-1",
          ownershipState: "FRONTIER"
        })
      ])
    );
    expect(firstRun.finalState.activeLocks).toEqual([]);
  });
});
