import { describe, expect, it } from "vitest";

import { buildNextClientSeqByPlayer, seedNextClientSeqByPlayer } from "./next-client-seq.js";
import type { StoredSimulationCommand } from "../command-store/command-store.js";

const cmd = (playerId: string, clientSeq: number, status: StoredSimulationCommand["status"]): StoredSimulationCommand => ({
  commandId: `${playerId}-${clientSeq}`,
  sessionId: "session-1",
  playerId,
  clientSeq,
  type: "EXPAND",
  payloadJson: "{}",
  queuedAt: clientSeq,
  status
});

describe("buildNextClientSeqByPlayer", () => {
  it("derives next client sequences without rereading the command store", () => {
    expect(
      buildNextClientSeqByPlayer(
        [
          {
            commandId: "cmd-1",
            sessionId: "session-1",
            playerId: "ai-1",
            clientSeq: 4,
            type: "EXPAND",
            payloadJson: "{}",
            queuedAt: 1,
            status: "RESOLVED"
          },
          {
            commandId: "cmd-2",
            sessionId: "session-1",
            playerId: "ai-1",
            clientSeq: 7,
            type: "SETTLE",
            payloadJson: "{}",
            queuedAt: 2,
            status: "QUEUED"
          },
          {
            commandId: "cmd-3",
            sessionId: "session-2",
            playerId: "ai-2",
            clientSeq: 3,
            type: "EXPAND",
            payloadJson: "{}",
            queuedAt: 3,
            status: "ACCEPTED"
          }
        ],
        ["ai-1", "ai-2", "ai-3"]
      )
    ).toEqual({
      "ai-1": 8,
      "ai-2": 4,
      "ai-3": 1
    });
  });
});

// Regression for the staging boot crash-loop (2026-07-14): recoveredCommands
// only carries QUEUED/ACCEPTED rows, so seeding from it alone understates the
// true high-water mark once a player's commands resolve/reject and reissues a
// low seq that collides with the resolved row still in the commands table.
describe("seedNextClientSeqByPlayer", () => {
  it("takes the higher of the recovered-commands max and the persisted (all-status) max", () => {
    expect(
      seedNextClientSeqByPlayer(
        [cmd("ai-1", 2, "QUEUED")],
        { "ai-1": 5, "ai-2": 1 },
        ["ai-1", "ai-2", "ai-3"]
      )
    ).toEqual({
      // persisted max (5) wins over recovered max (2) for ai-1.
      "ai-1": 6,
      "ai-2": 2,
      "ai-3": 1
    });
  });

  it("lets a not-yet-persisted recovered command raise the mark above the persisted max", () => {
    expect(
      seedNextClientSeqByPlayer([cmd("ai-1", 9, "QUEUED")], { "ai-1": 3 }, ["ai-1"])
    ).toEqual({ "ai-1": 10 });
  });

  it("returns 1 for a player with no recovered or persisted commands", () => {
    expect(seedNextClientSeqByPlayer([], {}, ["ai-1"])).toEqual({ "ai-1": 1 });
  });
});
