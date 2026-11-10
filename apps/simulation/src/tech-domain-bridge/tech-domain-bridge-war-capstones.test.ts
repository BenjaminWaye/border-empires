import { describe, expect, it } from "vitest";

import { reachableTechChoices } from "./tech-domain-bridge.js";

// Hive Mind Module II (muster-command) joins both War tier 3 lines, and both
// War tier 5 dossiers hang off it. Prereqs are all-of, so either tier 3 alone
// must not open Hive Mind II, and neither dossier opens before Hive Mind II.
describe("War capstone research gating", () => {
  const warTier3 = ["leatherworking", "siegecraft", "standing-army", "masonry", "fortified-walls", "steelworking"];

  it("needs both Dread Tower Cadre and Thunderplate Induction before offering Hive Mind Module II", () => {
    expect(reachableTechChoices(["masonry", "fortified-walls", "steelworking"])).not.toContain("muster-command");
    expect(reachableTechChoices(["leatherworking", "siegecraft", "standing-army"])).not.toContain("muster-command");
    expect(reachableTechChoices(warTier3)).toContain("muster-command");
  });

  it("offers neither War dossier until Hive Mind Module II is owned", () => {
    const beforeHiveMind = reachableTechChoices(warTier3);
    expect(beforeHiveMind).not.toContain("world-engine");
    expect(beforeHiveMind).not.toContain("aegis-dome");
    const afterHiveMind = reachableTechChoices([...warTier3, "muster-command"]);
    expect(afterHiveMind).toContain("world-engine");
    expect(afterHiveMind).toContain("aegis-dome");
  });
});
