import { describe, expect, it } from "vitest";
import { resolveFleetRaid } from "./galaxy-fleet-tick.js";

describe("resolveFleetRaid", () => {
  it("a Scout-only fleet reveals Garrison and leaves Stability untouched", () => {
    const outcome = resolveFleetRaid({ composition: { SCOUT: 1 }, garrisonProduction: 40, currentStability: 100 });
    expect(outcome).toEqual({
      reconOnly: true,
      damageDealt: 0,
      garrisonAbsorbed: 0,
      netDamage: 0,
      stabilityBefore: 100,
      stabilityAfter: 100,
      revealedGarrison: 40
    });
  });

  it("one Battleline through an undefended full-health Sector costs a flat 20 Stability, not 100", () => {
    const outcome = resolveFleetRaid({ composition: { BATTLELINE: 1 }, garrisonProduction: 0, currentStability: 100 });
    expect(outcome.damageDealt).toBe(200);
    expect(outcome.netDamage).toBe(20);
    expect(outcome.stabilityAfter).toBe(80);
  });

  it("a Dreadnought and a Battleline do the identical 20 once through (fleet size never scales the hit)", () => {
    const battleline = resolveFleetRaid({ composition: { BATTLELINE: 1 }, garrisonProduction: 0, currentStability: 100 });
    const dreadnought = resolveFleetRaid({ composition: { DREADNOUGHT: 1 }, garrisonProduction: 0, currentStability: 100 });
    expect(dreadnought.netDamage).toBe(battleline.netDamage);
  });

  it("a Sector takes five undefended hits to fall (100 / 20)", () => {
    let stability = 100;
    let hits = 0;
    while (stability > 0) {
      stability = resolveFleetRaid({ composition: { RAIDER: 1 }, garrisonProduction: 0, currentStability: stability }).stabilityAfter;
      hits += 1;
    }
    expect(hits).toBe(5);
  });

  it("Garrison absorbs damage 1:1 up to its own value before Stability takes any", () => {
    const outcome = resolveFleetRaid({ composition: { BATTLELINE: 1 }, garrisonProduction: 190, currentStability: 100 });
    expect(outcome.garrisonAbsorbed).toBe(190);
    expect(outcome.netDamage).toBe(10);
    expect(outcome.stabilityAfter).toBe(90);
  });

  it("Garrison alone can fully cancel a raid, leaving Stability untouched", () => {
    const outcome = resolveFleetRaid({ composition: { RAIDER: 1 }, garrisonProduction: 200, currentStability: 100 });
    expect(outcome.garrisonAbsorbed).toBe(50);
    expect(outcome.netDamage).toBe(0);
    expect(outcome.stabilityAfter).toBe(100);
  });

  it("Stability never drops below zero", () => {
    const outcome = resolveFleetRaid({ composition: { DREADNOUGHT: 1 }, garrisonProduction: 0, currentStability: 15 });
    expect(outcome.stabilityAfter).toBe(0);
  });

  it("a mixed composition still deals full damage (a Scout escort doesn't make a raid recon-only)", () => {
    const outcome = resolveFleetRaid({ composition: { SCOUT: 1, RAIDER: 1 }, garrisonProduction: 0, currentStability: 100 });
    expect(outcome.reconOnly).toBe(false);
    expect(outcome.damageDealt).toBe(50);
  });

  it("an all-Tanker composition is a true no-op -- no damage, no Garrison reveal, no Stability change", () => {
    const outcome = resolveFleetRaid({ composition: { TANKER: 3 }, garrisonProduction: 40, currentStability: 100 });
    expect(outcome).toEqual({
      reconOnly: false,
      damageDealt: 0,
      garrisonAbsorbed: 0,
      netDamage: 0,
      stabilityBefore: 100,
      stabilityAfter: 100
    });
  });
});
