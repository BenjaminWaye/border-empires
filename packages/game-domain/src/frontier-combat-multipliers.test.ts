import { describe, expect, it } from "vitest";
import { buildFrontierCombatPreview } from "@border-empires/shared";
import { resolveFrontierCombatMultipliers } from "./frontier-combat-multipliers.js";

describe("resolveFrontierCombatMultipliers", () => {
  it("returns 1 for all multipliers when no techs or domains", () => {
    const result = resolveFrontierCombatMultipliers([], undefined, undefined, undefined);
    expect(result).toEqual({
      attackVsSettledMult: 1,
      attackVsFortsMult: 1,
      attackVsBarbariansMult: 1,
      fortDefenseMult: 1,
    });
  });

  it("resolves attackVsBarbariansMult from Dewildernisation domain", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      ["supply-raiding"],
      [],
      [],
    );
    expect(result.attackVsBarbariansMult).toBe(1.5);
  });

  it("resolves attackVsSettledMult from known domains", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      ["iron-vanguard"],
      [],
      [],
    );
    expect(result.attackVsSettledMult).toBe(1.12);
    expect(result.attackVsFortsMult).toBe(1.12);
  });

  it("stacks multiplicative effects from multiple domains", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      ["iron-vanguard", "siege-state"],
      [],
      [],
    );
    expect(result.attackVsSettledMult).toBeCloseTo(1.12 * 1.10, 10);
    expect(result.attackVsFortsMult).toBeCloseTo(1.12 * 1.10, 10);
  });

  it("resolves fortDefenseMult from defender domains", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      [],
      [],
      ["fortress-realm"],
    );
    expect(result.fortDefenseMult).toBe(1.25);
  });

  it("resolves attackVsFortsMult from steelworking tech", () => {
    const result = resolveFrontierCombatMultipliers(
      ["steelworking"],
      [],
      [],
      [],
    );
    expect(result.attackVsFortsMult).toBe(1.10);
  });

  it("produces correct win chance when techs affect combat", () => {
    // SETTLED tile, no town, no fort: base defMult = 1.35 → defEff = 13.5
    // With iron-vanguard (attackVsSettledMult = 1.12): atkEff = 10 * 1.12 = 11.2
    // Win chance = 11.2 / (11.2 + 13.5) = 11.2 / 24.7 ≈ 0.4534
    const target = { terrain: "LAND" as const, ownershipState: "SETTLED" as const };
    const noTechPreview = buildFrontierCombatPreview(target);
    expect(noTechPreview.atkEff).toBe(10);
    expect(noTechPreview.defEff).toBe(13.5);
    expect(noTechPreview.winChance).toBeCloseTo(10 / 23.5, 6);

    const multipliers = resolveFrontierCombatMultipliers(
      [],
      ["iron-vanguard"],
      [],
      [],
    );
    const techPreview = buildFrontierCombatPreview(target, multipliers);
    expect(techPreview.atkEff).toBeCloseTo(11.2, 6);
    expect(techPreview.winChance).toBeCloseTo(11.2 / 24.7, 6);
    expect(techPreview.winChance).toBeGreaterThan(noTechPreview.winChance);
  });
});
