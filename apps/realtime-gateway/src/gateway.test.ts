import { describe, expect, it, vi } from "vitest";
import type { CommandEnvelope } from "@border-empires/sim-protocol";

describe("realtime gateway command envelope shape", () => {
  it("produces durable command payloads for frontier actions", () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(1234);
    const createEnvelope = (
      playerId: string
    ): CommandEnvelope => ({
      commandId: "cmd-1",
      sessionId: "session-1",
      playerId,
      clientSeq: 1,
      issuedAt: Date.now(),
      type: "ATTACK",
      payloadJson: JSON.stringify({ fromX: 10, fromY: 10, toX: 10, toY: 11 })
    });

    expect(createEnvelope("player-1")).toEqual({
      commandId: "cmd-1",
      sessionId: "session-1",
      playerId: "player-1",
      clientSeq: 1,
      issuedAt: 1234,
      type: "ATTACK",
      payloadJson: "{\"fromX\":10,\"fromY\":10,\"toX\":10,\"toY\":11}"
    });
    now.mockRestore();
  });
});
