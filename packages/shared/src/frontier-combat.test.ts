import { describe, expect, it } from "vitest";

import { buildFrontierCombatPreview, rollFrontierCombat, supportDefenseMult } from "./frontier-combat.js";
import { SUPPORT_DEFENSE_BASE, SUPPORT_DEFENSE_STEP } from "./config.js";

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
// Local-support defense (Phase 1)
// ---------------------------------------------------------------------------

describe("local-support defense", () => {
  it("flag=false: SETTLED defMult is exactly 1.35 (legacy parity)", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { localSupportDefenseEnabled: false }
    );
    expect(preview.defMult).toBeCloseTo(1.35, 10);
  });

  it("flag=false: SETTLED+town defMult is 1.35 × 1.2 (legacy parity)", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED", townType: "MARKET" },
      { localSupportDefenseEnabled: false }
    );
    expect(preview.defMult).toBeCloseTo(1.35 * 1.2, 10);
  });

  it("flag=true, support=0: defMult equals SUPPORT_DEFENSE_BASE", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED", support: 0 },
      { localSupportDefenseEnabled: true }
    );
    expect(preview.defMult).toBeCloseTo(SUPPORT_DEFENSE_BASE, 10);
  });

  it("flag=true, support=4: defMult equals SUPPORT_DEFENSE_BASE + 4*SUPPORT_DEFENSE_STEP", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED", support: 4 },
      { localSupportDefenseEnabled: true }
    );
    expect(preview.defMult).toBeCloseTo(SUPPORT_DEFENSE_BASE + 4 * SUPPORT_DEFENSE_STEP, 10);
  });

  it("flag=true: defMult rises with support (monotonically 0→4)", () => {
    const mults = [0, 1, 2, 3, 4].map(s =>
      buildFrontierCombatPreview(
        { terrain: "LAND", ownershipState: "SETTLED", support: s },
        { localSupportDefenseEnabled: true }
      ).defMult
    );
    for (let i = 0; i < mults.length - 1; i++) {
      expect(mults[i + 1]).toBeGreaterThan(mults[i] ?? 0);
    }
  });

  it("flag=true: FRONTIER target returns defEff=0 (unchanged)", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER" },
      { localSupportDefenseEnabled: true }
    );
    expect(preview.defMult).toBeCloseTo(0, 10);
    expect(preview.defEff).toBeCloseTo(0, 10);
  });

  it("flag=false: FRONTIER target returns defEff=0 (unchanged)", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "FRONTIER" },
      { localSupportDefenseEnabled: false }
    );
    expect(preview.defMult).toBeCloseTo(0, 10);
    expect(preview.defEff).toBeCloseTo(0, 10);
  });

  it("flag=true: support defaults to 0 when not provided (undefined)", () => {
    const withUndefined = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { localSupportDefenseEnabled: true }
    );
    const withZero = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED", support: 0 },
      { localSupportDefenseEnabled: true }
    );
    expect(withUndefined.defMult).toBeCloseTo(withZero.defMult, 10);
  });

  it("supportDefenseMult at support=2 equals SUPPORT_DEFENSE_BASE + 2*SUPPORT_DEFENSE_STEP", () => {
    expect(supportDefenseMult(2)).toBeCloseTo(SUPPORT_DEFENSE_BASE + 2 * SUPPORT_DEFENSE_STEP, 10);
  });
});
