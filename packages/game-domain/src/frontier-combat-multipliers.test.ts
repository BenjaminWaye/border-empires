import { describe, expect, it } from "vitest";
import { buildFrontierCombatPreview } from "@border-empires/shared";
import { resolveFrontierCombatMultipliers } from "./frontier-combat-multipliers.js";

// This suite is data-driven off data/domain-tree.json and data/tech-tree.json,
// so it names real domain/tech ids and asserts their real current effect
// values (not invented balance) — kept in sync with a 2026-08-11 content
// audit that found the ids this suite originally used ("titanium-vanguard",
// "fortress-realm", "steelworking") had all been redesigned away from
// granting combat multipliers (titanium-vanguard/fortress-realm now grant
// muster/vision effects instead; steelworking now only unlocks Thunder
// Bastion) without the test ever being updated, so it had been silently
// failing against stale expectations. Rewrote to reference domains that
// currently carry each effect: war-foundries/siege-state/titanium-dominion
// (attackVsFortsMult), stone-curtain (fortDefenseMult), supply-raiding
// (attackVsBarbariansMult, unchanged). NOTE: as of this audit, no domain or
// tech in the data files grants attackVsSettledMult at all — the field is
// still supported end-to-end in code (frontier-combat.ts,
// resolveFrontierCombatMultipliers) but currently unused by any real
// content; flagged rather than fabricated a domain for it.
describe("resolveFrontierCombatMultipliers", () => {
  it("returns 1 for all multipliers when no techs or domains", () => {
    const result = resolveFrontierCombatMultipliers([], undefined, undefined, undefined);
    expect(result).toEqual({
      attackVsSettledMult: 1,
      attackVsFortsMult: 1,
      attackVsBarbariansMult: 1,
      fortDefenseMult: 1,
      attackerStatMult: 1,
      defenderStatMult: 1,
    });
  });

  it("resolves attackerStatMult/defenderStatMult from Titanium Dominion's flat attack/defense mods", () => {
    const attackerResult = resolveFrontierCombatMultipliers([], ["titanium-dominion"], [], []);
    expect(attackerResult.attackerStatMult).toBe(1.18);
    const defenderResult = resolveFrontierCombatMultipliers([], [], [], ["titanium-dominion"]);
    expect(defenderResult.defenderStatMult).toBe(1.18);
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

  it("resolves attackVsFortsMult from War Foundries domain", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      ["war-foundries"],
      [],
      [],
    );
    expect(result.attackVsFortsMult).toBe(1.15);
  });

  it("stacks multiplicative effects from multiple domains", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      ["war-foundries", "siege-state"],
      [],
      [],
    );
    expect(result.attackVsFortsMult).toBeCloseTo(1.15 * 1.2, 10);
  });

  it("resolves fortDefenseMult from Garrison Doctrine domain", () => {
    const result = resolveFrontierCombatMultipliers(
      [],
      [],
      [],
      ["stone-curtain"],
    );
    expect(result.fortDefenseMult).toBe(1.5);
  });

  it("resolves both attackVsFortsMult and fortDefenseMult from Titanium Dominion capstone", () => {
    const attackerResult = resolveFrontierCombatMultipliers([], ["titanium-dominion"], [], []);
    expect(attackerResult.attackVsFortsMult).toBe(1.15);
    const defenderResult = resolveFrontierCombatMultipliers([], [], [], ["titanium-dominion"]);
    expect(defenderResult.fortDefenseMult).toBe(1.15);
  });

  it("steelworking tech no longer grants a combat multiplier (migrated to domain-only combat effects)", () => {
    const result = resolveFrontierCombatMultipliers(
      ["steelworking"],
      [],
      [],
      [],
    );
    expect(result.attackVsFortsMult).toBe(1);
  });

  it("produces correct win chance when a domain boosts attack against a fort", () => {
    // FORT-variant target, no town/dock/settled bonus: baseFortDefenseMult("FORT") = 2.5,
    // no defender fortDefenseMult modifier → defEff = 10 * 2.5 = 25.
    const target = { terrain: "LAND" as const, fortVariant: "FORT" as const };
    const noDomainPreview = buildFrontierCombatPreview(target);
    expect(noDomainPreview.atkEff).toBe(10);
    expect(noDomainPreview.defEff).toBe(25);
    // Win chance uses an exponentiated power ratio (COMBAT_WIN_CHANCE_EXPONENT = 2), not a flat ratio.
    expect(noDomainPreview.winChance).toBeCloseTo(10 ** 2 / (10 ** 2 + 25 ** 2), 6);

    // War Foundries (attackVsFortsMult = 1.15, plus its flat mods.attack = 1.08
    // general attack bonus): atkEff = 10 * 1.15 * 1.08 = 12.42.
    const multipliers = resolveFrontierCombatMultipliers(
      [],
      ["war-foundries"],
      [],
      [],
    );
    const domainPreview = buildFrontierCombatPreview(target, multipliers);
    expect(domainPreview.atkEff).toBeCloseTo(12.42, 6);
    expect(domainPreview.winChance).toBeCloseTo(12.42 ** 2 / (12.42 ** 2 + 25 ** 2), 6);
    expect(domainPreview.winChance).toBeGreaterThan(noDomainPreview.winChance);
  });
});
