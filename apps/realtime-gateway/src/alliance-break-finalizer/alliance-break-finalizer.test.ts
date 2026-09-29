import { describe, expect, it, vi } from "vitest";

import { createAllianceBreakFinalizer } from "./alliance-break-finalizer.js";
import type { SocialExpiredAllianceBreak } from "../social-state/social-state-types.js";

const expiredBreak = (a: string, b: string): SocialExpiredAllianceBreak =>
  ({ playerIds: [a, b] }) as unknown as SocialExpiredAllianceBreak;

describe("createAllianceBreakFinalizer", () => {
  it("finalizes only the pairs the simulation un-allied, then fans out the result", async () => {
    const payloads = new Map<string, unknown[]>([["a", [{ type: "X" }]]]);
    const socialState = {
      expiredAllianceBreaks: vi.fn(() => [expiredBreak("a", "b"), expiredBreak("c", "d")]),
      finalizeExpiredAllianceBreaks: vi.fn(() => ({ expiredBreaks: [expiredBreak("a", "b")], payloadsByPlayerId: payloads }))
    };
    const syncAllianceToSimulation = vi.fn(async (input: { playerId: string }) => input.playerId === "a");
    const fanoutPlayerPayloads = vi.fn();

    await createAllianceBreakFinalizer({ socialState, syncAllianceToSimulation, fanoutPlayerPayloads })();

    expect(socialState.finalizeExpiredAllianceBreaks).toHaveBeenCalledWith([["a", "b"]]);
    expect(fanoutPlayerPayloads).toHaveBeenCalledWith(payloads);
  });

  it("skips an overlapping run instead of syncing the same breaks twice", async () => {
    let release: (value: boolean) => void = () => undefined;
    const socialState = {
      expiredAllianceBreaks: vi.fn(() => [expiredBreak("a", "b")]),
      finalizeExpiredAllianceBreaks: vi.fn(() => ({ expiredBreaks: [], payloadsByPlayerId: new Map() }))
    };
    const syncAllianceToSimulation = vi.fn(() => new Promise<boolean>((resolve) => { release = resolve; }));
    const finalize = createAllianceBreakFinalizer({ socialState, syncAllianceToSimulation, fanoutPlayerPayloads: vi.fn() });

    const first = finalize();
    await finalize();
    release(true);
    await first;

    expect(syncAllianceToSimulation).toHaveBeenCalledTimes(1);
  });
});
