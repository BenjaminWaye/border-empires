import { describe, expect, it } from "vitest";

import { buildNextClientSeqByPlayer } from "./next-client-seq.js";

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
