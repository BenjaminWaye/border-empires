import { describe, expect, it } from "vitest";

import {
  applyGatewayRecoveryNextClientSeq,
  bindQueuedFrontierCommandIdentity,
  matchesCurrentFrontierCommand
} from "./client-frontier-command.js";

describe("client frontier command helpers", () => {
  it("advances the local next client sequence from gateway recovery", () => {
    const state = { nextCommandClientSeq: 1 };

    applyGatewayRecoveryNextClientSeq(state, 6);

    expect(state.nextCommandClientSeq).toBe(6);
  });

  it("binds a queued gateway command id to the active frontier action by client sequence", () => {
    const state = {
      nextCommandClientSeq: 3,
      actionCurrent: { x: 10, y: 11, retries: 0, clientSeq: 3 } as { x: number; y: number; retries: number; clientSeq?: number; commandId?: string }
    };

    const bound = bindQueuedFrontierCommandIdentity(state, { commandId: "cmd-3", clientSeq: 3 });

    expect(bound).toBe(true);
    expect(state.nextCommandClientSeq).toBe(4);
    expect(state.actionCurrent.commandId).toBe("cmd-3");
  });

  it("rejects mismatched command ids once the active frontier action has been bound", () => {
    const state = {
      actionCurrent: { x: 10, y: 11, retries: 0, clientSeq: 3, commandId: "cmd-3" } as {
        x: number;
        y: number;
        retries: number;
        clientSeq?: number;
        commandId?: string;
      }
    };

    expect(matchesCurrentFrontierCommand(state, "cmd-3")).toBe(true);
    expect(matchesCurrentFrontierCommand(state, "cmd-4")).toBe(false);
  });

  it("still matches a command awaiting binding (actionCurrent exists, no commandId yet)", () => {
    const state = {
      actionCurrent: { x: 10, y: 11, retries: 0, clientSeq: 3 } as {
        x: number;
        y: number;
        retries: number;
        clientSeq?: number;
        commandId?: string;
      }
    };

    expect(matchesCurrentFrontierCommand(state, "cmd-3")).toBe(true);
  });

  it("still matches with nothing in flight when the caller allows it (COMBAT_RESULT/COMBAT_START defender path)", () => {
    // A defending client never submitted the ATTACK it's being notified
    // about, so it has no actionCurrent at all -- COMBAT_RESULT/COMBAT_START
    // must still apply (see client-network.tiles-revision-regression.test.ts's
    // ATTACK-defender case), so this call site omits requireActionInFlight.
    const state: { actionCurrent: { x: number; y: number; retries: number; clientSeq?: number; commandId?: string } | undefined } = {
      actionCurrent: undefined
    };

    expect(matchesCurrentFrontierCommand(state, "some-other-command")).toBe(true);
  });

  it("rejects a late/unrelated command once nothing is in flight, for callers that require it", () => {
    // Regression: a frontier rejection (e.g. NOT_ADJACENT) clears
    // actionCurrent to undefined. A late ACTION_ACCEPTED/FRONTIER_RESULT for
    // some other command -- e.g. the server's own waypoint-queue auto-drain
    // racing the same hop -- must not be adopted as if it belonged to
    // whatever the player just tried, which would make a real failure look
    // like a silent success. Those two call sites pass requireActionInFlight.
    const state: { actionCurrent: { x: number; y: number; retries: number; clientSeq?: number; commandId?: string } | undefined } = {
      actionCurrent: undefined
    };

    expect(matchesCurrentFrontierCommand(state, "some-other-command", true)).toBe(false);
  });
});
