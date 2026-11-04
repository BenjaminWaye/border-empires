import { describe, expect, it } from "vitest";
import { emitPerConnectHellos } from "./per-connect-hellos.js";

describe("emitPerConnectHellos", () => {
  it("kicks a dev-queue drain for the connecting player", () => {
    const calls: string[] = [];
    const runtime = {
      resendReachForPlayer: () => calls.push("reach-resend"),
      drainDevQueueForPlayer: (playerId: string) => calls.push(`drain:${playerId}`),
      refreshResourceSlotCachesForPlayer: (playerId: string) => calls.push(`resource-slot-refresh:${playerId}`)
    };

    emitPerConnectHellos(runtime, "player-1", { error: () => {} });

    expect(calls).toContain("drain:player-1");
    expect(calls).toContain("resource-slot-refresh:player-1");
  });

  it("isolates a failing hello so the drain still runs", () => {
    const calls: string[] = [];
    const runtime = {
      resendReachForPlayer: () => { throw new Error("boom"); },
      drainDevQueueForPlayer: (playerId: string) => calls.push(`drain:${playerId}`),
      refreshResourceSlotCachesForPlayer: (playerId: string) => calls.push(`resource-slot-refresh:${playerId}`)
    };
    const errors: Array<Record<string, unknown>> = [];

    emitPerConnectHellos(runtime, "player-1", { error: (payload) => errors.push(payload) });

    expect(calls).toEqual(["drain:player-1", "resource-slot-refresh:player-1"]);
    expect(errors).toHaveLength(1);
  });
});
