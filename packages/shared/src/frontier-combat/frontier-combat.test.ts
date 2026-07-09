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

  describe("breakthrough momentum", () => {
    const now = 1_000_000;

    it("applies no debuff when the tile has no breach window (baseline 1.35x defense)", () => {
      const preview = buildFrontierCombatPreview(
        { terrain: "LAND", ownershipState: "SETTLED" },
        { nowMs: now }
      );

      expect(preview.defMult).toBeCloseTo(1.35, 6);
      expect(preview.defEff).toBeCloseTo(13.5, 6);
    });

    it("applies the 0.7x breach debuff when the tile is within its breach window (1.35 x 0.7)", () => {
      const preview = buildFrontierCombatPreview(
        { terrain: "LAND", ownershipState: "SETTLED", breachShockUntil: now + 30_000 },
        { nowMs: now }
      );

      expect(preview.defMult).toBeCloseTo(1.35 * 0.7, 6);
      expect(preview.defEff).toBeCloseTo(10 * 1.35 * 0.7, 6);
    });

    it("does not apply the breach debuff once the breach window has elapsed", () => {
      const preview = buildFrontierCombatPreview(
        { terrain: "LAND", ownershipState: "SETTLED", breachShockUntil: now - 1 },
        { nowMs: now }
      );

      expect(preview.defMult).toBeCloseTo(1.35, 6);
    });

    it("treats frontier targets as zero-defense even while breached", () => {
      const preview = buildFrontierCombatPreview(
        { terrain: "LAND", ownershipState: "FRONTIER", breachShockUntil: now + 30_000 },
        { nowMs: now }
      );

      expect(preview.defMult).toBeCloseTo(0, 6);
      expect(preview.defEff).toBeCloseTo(0, 6);
    });

    it("stacks the breach debuff multiplicatively with town defense (1.35 x 1.2 x 0.7)", () => {
      const preview = buildFrontierCombatPreview(
        {
          terrain: "LAND",
          ownershipState: "SETTLED",
          townType: "FARMING",
          breachShockUntil: now + 30_000
        },
        { nowMs: now }
      );

      expect(preview.defMult).toBeCloseTo(1.35 * 1.2 * 0.7, 6);
    });

    it("gives the attacker a higher win chance against a breached tile than an identical unbreached tile", () => {
      const baseline = buildFrontierCombatPreview(
        { terrain: "LAND", ownershipState: "SETTLED", townType: "FARMING" },
        { nowMs: now }
      );
      const breached = buildFrontierCombatPreview(
        {
          terrain: "LAND",
          ownershipState: "SETTLED",
          townType: "FARMING",
          breachShockUntil: now + 30_000
        },
        { nowMs: now }
      );

      expect(breached.winChance).toBeGreaterThan(baseline.winChance);
    });
  });
});
