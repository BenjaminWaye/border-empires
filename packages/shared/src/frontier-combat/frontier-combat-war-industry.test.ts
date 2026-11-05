import { describe, expect, it } from "vitest";

import { buildFrontierCombatPreview, noWarIndustryLabel, warIndustryEdge } from "./frontier-combat.js";

// "Missing war industry" vulnerability: how buildFrontierCombatPreview folds
// the caller-supplied mults/labels, and the shared warIndustryEdge rule the
// sim and gateway both use to compute them.
describe("frontier combat — war industry", () => {
  it("doubles attack effectiveness via noWarIndustryVulnerabilityMult when the defender has no war industry", () => {
    const baseline = buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "SETTLED" });
    const boosted = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { noWarIndustryVulnerabilityMult: 2.0 }
    );

    expect(baseline.atkMult).toBe(1);
    expect(boosted.atkMult).toBeCloseTo(2.0, 6);
    expect(boosted.atkEff).toBeCloseTo(20, 6);
    expect(boosted.winChance).toBeGreaterThan(baseline.winChance);
  });

  it("combines noWarIndustryVulnerabilityMult multiplicatively with other attack mults", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { titaniumWeaponsFactoryAttackMult: 1.03, noWarIndustryVulnerabilityMult: 2.0 }
    );
    expect(preview.atkMult).toBeCloseTo(1.03 * 2.0, 6);
  });

  it("doubles defense effectiveness via noWarIndustryDefenseVulnerabilityMult when the attacker has no war industry", () => {
    const baseline = buildFrontierCombatPreview({ terrain: "LAND", ownershipState: "SETTLED" });
    const boosted = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { noWarIndustryDefenseVulnerabilityMult: 2.0 }
    );

    expect(baseline.defMult).toBeCloseTo(1.3, 6);
    expect(boosted.defMult).toBeCloseTo(1.3 * 2.0, 6);
    expect(boosted.winChance).toBeLessThan(baseline.winChance);
  });

  it("combines noWarIndustryDefenseVulnerabilityMult multiplicatively with other defense mults", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { titaniumWeaponsFactoryDefenseMult: 1.03, noWarIndustryDefenseVulnerabilityMult: 2.0 }
    );
    expect(preview.defMult).toBeCloseTo(1.3 * 1.03 * 2.0, 6);
  });

  it("uses the caller-supplied noWarIndustryVulnerabilityLabel naming the specific missing factory", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { noWarIndustryVulnerabilityMult: 2.0, noWarIndustryVulnerabilityLabel: "Target missing Umbrite Weapons Factory" }
    );
    expect(preview.attacker.battle.find((e) => e.mult === 2.0)?.label).toBe("Target missing Umbrite Weapons Factory");
  });

  it("uses the caller-supplied noWarIndustryDefenseVulnerabilityLabel naming the specific missing factory", () => {
    const preview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { noWarIndustryDefenseVulnerabilityMult: 2.0, noWarIndustryDefenseVulnerabilityLabel: "Attacker missing Titanium Weapons Factory" }
    );
    expect(preview.defender.battle.find((e) => e.mult === 2.0)?.label).toBe("Attacker missing Titanium Weapons Factory");
  });

  it("falls back to the generic war-industry label when no override label is supplied", () => {
    const attackPreview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { noWarIndustryVulnerabilityMult: 2.0 }
    );
    expect(attackPreview.attacker.battle.find((e) => e.mult === 2.0)?.label).toBe("Target has no war industry");

    const defensePreview = buildFrontierCombatPreview(
      { terrain: "LAND", ownershipState: "SETTLED" },
      { noWarIndustryDefenseVulnerabilityMult: 2.0 }
    );
    expect(defensePreview.defender.battle.find((e) => e.mult === 2.0)?.label).toBe("Attacker has no war industry");
  });

  describe("warIndustryEdge", () => {
    const none = { titanium: false, umbrite: false };
    const ti = { titanium: true, umbrite: false };
    const um = { titanium: false, umbrite: true };
    const both = { titanium: true, umbrite: true };
    it("grants nothing for a type the holder doesn't own itself", () => {
      expect(warIndustryEdge("Target", none, none)).toEqual({ mult: 1, label: undefined });
      expect(warIndustryEdge("Target", none, ti)).toEqual({ mult: 1, label: undefined });
      expect(warIndustryEdge("Target", ti, ti)).toEqual({ mult: 1, label: undefined });
      expect(warIndustryEdge("Target", both, both)).toEqual({ mult: 1, label: undefined });
    });
    it("grants a flat 2x for owned types the other side lacks, naming only those", () => {
      expect(warIndustryEdge("Attacker", ti, none)).toEqual({ mult: 2, label: "Attacker missing Titanium Weapons Factory" });
      expect(warIndustryEdge("Target", um, ti)).toEqual({ mult: 2, label: "Target missing Umbrite Weapons Factory" });
      expect(warIndustryEdge("Target", both, ti)).toEqual({ mult: 2, label: "Target missing Umbrite Weapons Factory" });
      expect(warIndustryEdge("Target", both, none)).toEqual({ mult: 2, label: "Target missing Titanium & Umbrite Weapons Factory" });
    });
  });

  describe("noWarIndustryLabel", () => {
    it("names the specific factory type missing, or both, or falls back to the generic phrasing", () => {
      expect(noWarIndustryLabel("Target", false, true)).toBe("Target missing Titanium Weapons Factory");
      expect(noWarIndustryLabel("Target", true, false)).toBe("Target missing Umbrite Weapons Factory");
      expect(noWarIndustryLabel("Attacker", false, false)).toBe("Attacker missing Titanium & Umbrite Weapons Factory");
      expect(noWarIndustryLabel("Attacker", true, true)).toBe("Attacker has no war industry");
    });
  });
});
