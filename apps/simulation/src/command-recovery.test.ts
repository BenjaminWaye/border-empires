import { describe, expect, it } from "vitest";

import { applyEventsToRecoveredCommandHistory, recoverCommandHistory } from "./command-recovery.js";

describe("recoverCommandHistory", () => {
  it("groups event history by command id and preserves queued order", () => {
    const recovered = recoverCommandHistory(
      [
        {
          commandId: "cmd-2",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 2,
          type: "ATTACK",
          payloadJson: "{}",
          queuedAt: 200,
          status: "QUEUED"
        },
        {
          commandId: "cmd-1",
          sessionId: "session-1",
          playerId: "player-1",
          clientSeq: 1,
          type: "ATTACK",
          payloadJson: "{}",
          queuedAt: 100,
          status: "RESOLVED",
          resolvedAt: 300
        }
      ],
      [
        {
          eventType: "COMMAND_ACCEPTED",
          commandId: "cmd-1",
          playerId: "player-1",
          actionType: "ATTACK",
          originX: 10,
          originY: 10,
          targetX: 10,
          targetY: 11,
          resolvesAt: 200
        }
      ]
    );

    expect(recovered.commands.map((command) => command.commandId)).toEqual(["cmd-1", "cmd-2"]);
    expect(recovered.eventsByCommandId.get("cmd-1")).toHaveLength(1);
    expect(recovered.eventsByCommandId.has("cmd-2")).toBe(false);
  });

  it("caps retained terminal command histories so replay state cannot grow unbounded", () => {
    const recovered = applyEventsToRecoveredCommandHistory(
      {
        commands: [],
        eventsByCommandId: new Map()
      },
      [
        {
          eventType: "COMMAND_REJECTED",
          commandId: "cmd-1",
          playerId: "player-1",
          code: "ERR",
          message: "rejected"
        },
        {
          eventType: "COMMAND_REJECTED",
          commandId: "cmd-2",
          playerId: "player-1",
          code: "ERR",
          message: "rejected"
        },
        {
          eventType: "COMMAND_REJECTED",
          commandId: "cmd-3",
          playerId: "player-1",
          code: "ERR",
          message: "rejected"
        }
      ],
      { maxTerminalCommandReplayHistory: 2 }
    );

    expect(recovered.eventsByCommandId.has("cmd-1")).toBe(false);
    expect(recovered.eventsByCommandId.has("cmd-2")).toBe(true);
    expect(recovered.eventsByCommandId.has("cmd-3")).toBe(true);
  });
});
