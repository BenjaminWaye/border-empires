import { describe, expect, it } from "vitest";
import { RESTART_PARITY_COMMAND_TYPES } from "../../../packages/sim-protocol/src/command-coverage-sets.js";

import { laneForCommand } from "./command-lane.js";

describe("command lane routing", () => {
  it("routes ai-runtime commands to the ai lane", () => {
    expect(
      laneForCommand({
        sessionId: "ai-runtime:ai-1",
        type: "ATTACK"
      })
    ).toBe("ai");
  });

  it("routes system-runtime commands to the system lane", () => {
    expect(
      laneForCommand({
        sessionId: "system-runtime:barbarian-1",
        type: "ATTACK"
      })
    ).toBe("system");
  });

  it("keeps human frontier commands on the human interactive lane", () => {
    expect(
      laneForCommand({
        sessionId: "session-1",
        type: "ATTACK"
      })
    ).toBe("human_interactive");
  });

  it.each(RESTART_PARITY_COMMAND_TYPES)("routes human command %s to a human lane", (type) => {
    expect(
      laneForCommand({
        sessionId: "session-1",
        type
      })
    ).not.toBe("system");
  });
});
