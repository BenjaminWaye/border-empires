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
});
