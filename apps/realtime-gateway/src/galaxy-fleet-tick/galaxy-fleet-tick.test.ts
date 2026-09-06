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

  it("one Battleline exactly breaks a full-health, no-Garrison Sector (200 = 100 Stability + 0 Garrison)", () => {
    const outcome = resolveFleetRaid({ composition: { BATTLELINE: 1 }, garrisonProduction: 0, currentStability: 100 });
    expect(outcome.netDamage).toBe(200);
    expect(outcome.stabilityAfter).toBe(0);
  });

  it("Garrison absorbs damage 1:1 up to its own value before Stability takes any", () => {
    const outcome = resolveFleetRaid({ composition: { BATTLELINE: 1 }, garrisonProduction: 150, currentStability: 100 });
    expect(outcome.garrisonAbsorbed).toBe(150);
    expect(outcome.netDamage).toBe(50);
    expect(outcome.stabilityAfter).toBe(50);
  });

  it("Garrison alone can fully cancel a raid, leaving Stability untouched", () => {
    const outcome = resolveFleetRaid({ composition: { RAIDER: 1 }, garrisonProduction: 200, currentStability: 100 });
    expect(outcome.garrisonAbsorbed).toBe(50);
    expect(outcome.netDamage).toBe(0);
    expect(outcome.stabilityAfter).toBe(100);
  });

  it("Stability never drops below zero even against overwhelming damage", () => {
    const outcome = resolveFleetRaid({ composition: { DREADNOUGHT: 1 }, garrisonProduction: 0, currentStability: 30 });
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
