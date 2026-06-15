import { describe, expect, it } from "vitest";

import { buildFrontierCombatPreview, rollFrontierCombat } from "./frontier-combat.js";
import { BREAKTHROUGH_DEBUFF_MULT } from "./config.js";

describe("frontier combat", () => {
  it("builds preview values for a settled town target", () => {
    const preview = buildFrontierCombatPreview({
      terrain: "LAND",
      ownershipState: "SETTLED",
      townType: "FARMING"
    });

    expect(preview.atkEff).toBe(10);
    expect(preview.atkMult).toBe(1);
    expect(preview.defEff).toBeCloseTo(16.2, 6);
    expect(preview.winChance).toBeCloseTo(10 / 26.2, 6);
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
  });

  it("keeps preview and resolution tagged to the same combat module", () => {
    expect(buildFrontierCombatPreview.__combatModule).toBe(rollFrontierCombat.__combatModule);
  });

  it("scales attacker effective power by attackerOutpostMult", () => {
    const baseline = buildFrontierCombatPreview({
      terrain: "LAND",
      ownershipState: "SETTLED",
      townType: "FARMING"
    });
    const boosted = buildFrontierCombatPreview(
      {
        terrain: "LAND",
        ownershipState: "SETTLED",
        townType: "FARMING"
      },
      { attackerOutpostMult: 1.25 }
    );

    expect(baseline.atkEff).toBe(10);
    expect(boosted.atkEff).toBeCloseTo(12.5, 6);
    expect(boosted.atkMult).toBeCloseTo(1.25, 6);
    expect(boosted.winChance).toBeGreaterThan(baseline.winChance);
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

// ---------------------------------------------------------------------------
// Breakthrough momentum debuff
// ---------------------------------------------------------------------------

describe("breakthrough momentum", () => {
  it("no breach: SETTLED defMult is 1.35", () => {
    const preview = buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "SETTLED" });
    expect(preview.defMult).toBeCloseTo(1.35, 10);
  });

  it("breached: SETTLED defMult is 1.35 × BREAKTHROUGH_DEBUFF_MULT", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { captureBreached: true }
    );
    expect(preview.defMult).toBeCloseTo(1.35 * BREAKTHROUGH_DEBUFF_MULT, 10);
  });

  it("breached FRONTIER still returns defEff=0", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER" },
      { captureBreached: true }
    );
    expect(preview.defMult).toBeCloseTo(0, 10);
    expect(preview.defEff).toBeCloseTo(0, 10);
  });

  it("breached SETTLED+town defMult is 1.35 × 1.2 × BREAKTHROUGH_DEBUFF_MULT", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED", townType: "MARKET" },
      { captureBreached: true }
    );
    expect(preview.defMult).toBeCloseTo(1.35 * 1.2 * BREAKTHROUGH_DEBUFF_MULT, 10);
  });

  it("breach raises attacker win chance", () => {
    const normal = buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "SETTLED" });
    const breached = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { captureBreached: true }
    );
    expect(breached.winChance).toBeGreaterThan(normal.winChance);
  });
});
