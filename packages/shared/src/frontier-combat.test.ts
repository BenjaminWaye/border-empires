import { describe, expect, it } from "vitest";

import { buildFrontierCombatPreview, rollFrontierCombat } from "./frontier-combat.js";

describe("frontier combat", () => {
  it("builds preview values for a settled town target", () => {
    const preview = buildFrontierCombatPreview({
      terrain: "LAND",
      ownershipState: "SETTLED",
      townType: "FARMING"
    });

    expect(preview.atkEff).toBe(10);
    expect(preview.defEff).toBeCloseTo(16.2, 6);
    expect(preview.winChance).toBeCloseTo(10 / 26.2, 6);
    expect(preview.breakthroughWinChance).toBeCloseTo(10 / (10 + 16.2 * 0.6), 6);
  });

  it("uses the same preview chance when rolling combat", () => {
    const result = rollFrontierCombat(
      {
        terrain: "LAND",
        ownershipState: "SETTLED",
        townType: "FARMING"
      },
      "ATTACK",
      0.99
    );

    expect(result.winChance).toBeCloseTo(10 / 26.2, 6);
    expect(result.attackerWon).toBe(false);
  });

  it("treats frontier targets as zero-defense captures", () => {
    const preview = buildFrontierCombatPreview({
      terrain: "LAND",
      ownershipState: "FRONTIER"
    });

    expect(preview.defMult).toBeCloseTo(0, 6);
    expect(preview.defEff).toBeCloseTo(0, 6);
    expect(preview.winChance).toBeCloseTo(1, 6);
    expect(preview.breakthroughWinChance).toBeCloseTo(1, 6);
  });

  it("keeps preview and resolution tagged to the same combat module", () => {
    expect(buildFrontierCombatPreview.__combatModule).toBe(rollFrontierCombat.__combatModule);
  });

  it("keeps empirical win rate close to preview win chance", () => {
    const preview = buildFrontierCombatPreview({
      terrain: "LAND",
      ownershipState: "SETTLED",
      townType: "FARMING",
      dockId: "dock-1"
    });
    let wins = 0;
    const samples = 2_000;
    for (let i = 0; i < samples; i += 1) {
      const randomValue = (i + 0.5) / samples;
      if (rollFrontierCombat({ terrain: "LAND", ownershipState: "SETTLED", townType: "FARMING", dockId: "dock-1" }, "ATTACK", randomValue).attackerWon) {
        wins += 1;
      }
    }
    expect(wins / samples).toBeCloseTo(preview.winChance, 2);
  });
});
