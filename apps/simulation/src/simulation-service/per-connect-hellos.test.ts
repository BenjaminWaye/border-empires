import { describe, expect, it } from "vitest";
import { emitPerConnectHellos } from "./per-connect-hellos.js";

describe("emitPerConnectHellos", () => {
  it("kicks a dev-queue drain for the connecting player", () => {
    const calls: string[] = [];
    const runtime = {
      emitShardRainHelloFor: () => calls.push("shard-rain"),
      resendReachForPlayer: () => calls.push("reach-resend"),
      drainDevQueueForPlayer: (playerId: string) => calls.push(`drain:${playerId}`)
    };

    emitPerConnectHellos(runtime, "player-1", { error: () => {} });

    expect(calls).toContain("drain:player-1");
  });

  it("isolates a failing hello so the drain still runs", () => {
    const calls: string[] = [];
    const runtime = {
      emitShardRainHelloFor: () => { throw new Error("boom"); },
      resendReachForPlayer: () => calls.push("reach-resend"),
      drainDevQueueForPlayer: (playerId: string) => calls.push(`drain:${playerId}`)
    };
    const errors: Array<Record<string, unknown>> = [];

    emitPerConnectHellos(runtime, "player-1", { error: (payload) => errors.push(payload) });

    expect(calls).toEqual(["reach-resend", "drain:player-1"]);
    expect(errors).toHaveLength(1);
  });
});
