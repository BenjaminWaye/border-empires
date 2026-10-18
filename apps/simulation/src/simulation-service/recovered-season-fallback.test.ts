import { describe, expect, it } from "vitest";
import { recoveredSeasonFallback } from "./recovered-season-fallback.js";
import { createInitialSeasonState } from "../season-lifecycle.js";

describe("season ruleset compatibility", () => {
  it("enables the complete specialization catalogue for a newly created campaign", () => {
    expect(createInitialSeasonState({ seasonSequence: 2, rulesetId: "seasonal", worldSeed: 42, startedAt: 100 }).afcUpgradeRuleset).toBe("afc-v1");
  });
  it("never upgrades an older recovered world merely because it lacked season metadata", () => {
    expect(recoveredSeasonFallback({ rulesetId: undefined, mapStyle: "continents", seedProfile: undefined, now: 100 }).afcUpgradeRuleset).toBeUndefined();
  });
});
