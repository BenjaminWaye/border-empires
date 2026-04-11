import { describe, expect, it } from "vitest";
import { ABILITY_DEFS } from "./server-game-constants.js";

describe("aether wall server definitions", () => {
  it("registers aether wall and reveal empire stats as crystal abilities", () => {
    expect(ABILITY_DEFS.aether_wall).toMatchObject({
      id: "aether_wall",
      requiredTechIds: ["harborcraft"],
      crystalCost: 25
    });
    expect(ABILITY_DEFS.reveal_empire_stats).toMatchObject({
      id: "reveal_empire_stats",
      requiredTechIds: ["surveying"],
      crystalCost: 15
    });
    expect(ABILITY_DEFS.siphon).toMatchObject({
      id: "siphon",
      requiredTechIds: ["logistics"],
      crystalCost: 20
    });
  });
});
