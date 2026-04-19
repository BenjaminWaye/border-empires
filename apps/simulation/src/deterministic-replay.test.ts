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

    const firstRun = runDeterministicReplay(commands, { startTime: 1_000 });
    const secondRun = runDeterministicReplay(commands, { startTime: 1_000 });

    expect(firstRun).toEqual(secondRun);
    expect(firstRun.events.map((event) => event.eventType)).toEqual([
      "COMMAND_ACCEPTED",
      "COMBAT_RESOLVED",
      "TILE_DELTA_BATCH"
    ]);
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
