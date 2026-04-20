import { describe, expect, it } from "vitest";

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
});
