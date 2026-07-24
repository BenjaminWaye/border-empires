import { describe, expect, test } from "vitest";
import {
  LOCAL_SUPPORT_MAX_SIDES,
  TOWN_GARRISON_BONUS,
  empireIntegrity,
  garrisonBonusForFortDefenseMult,
  integrityEconomyMult,
  integrityGrowthMult,
  localSupportRatioForTile
} from "./index.js";
import { FORT_TIER_LADDER } from "./structure-costs/structure-costs.js";

describe("localSupportRatioForTile", () => {
  test("an isolated tile with no neighbours and no garrison scores 0", () => {
    expect(localSupportRatioForTile(0, 0)).toBe(0);
  });

  test("a tile fully surrounded by friendly settled tiles scores 1", () => {
    expect(localSupportRatioForTile(4, 0)).toBe(1);
  });

  test("scales linearly with supported sides", () => {
    expect(localSupportRatioForTile(1, 0)).toBeCloseTo(0.25, 5);
    expect(localSupportRatioForTile(2, 0)).toBeCloseTo(0.5, 5);
    expect(localSupportRatioForTile(3, 0)).toBeCloseTo(0.75, 5);
  });

  test("garrison bonus can push an unsupported tile toward full support", () => {
    expect(localSupportRatioForTile(0, 2)).toBeCloseTo(0.5, 5);
  });

  test("clamps above 1 when support + garrison exceeds the max", () => {
    expect(localSupportRatioForTile(4, 4)).toBe(1);
  });

  test("clamps below 0 (defensive — supportedSides should never be negative in practice)", () => {
    expect(localSupportRatioForTile(-1, 0)).toBe(0);
  });
});

describe("garrisonBonusForFortDefenseMult", () => {
  test("THUNDER_BASTION alone fully secures an otherwise-unsupported tile", () => {
    const bonus = garrisonBonusForFortDefenseMult(FORT_TIER_LADDER.THUNDER_BASTION.defenseMult);
    expect(bonus).toBeCloseTo(LOCAL_SUPPORT_MAX_SIDES, 5);
    expect(localSupportRatioForTile(0, bonus)).toBe(1);
  });

  test("lower fort tiers contribute proportionally less", () => {
    const wooden = garrisonBonusForFortDefenseMult(FORT_TIER_LADDER.WOODEN_FORT.defenseMult);
    const fort = garrisonBonusForFortDefenseMult(FORT_TIER_LADDER.FORT.defenseMult);
    const ironBastion = garrisonBonusForFortDefenseMult(FORT_TIER_LADDER.IRON_BASTION.defenseMult);
    const thunderBastion = garrisonBonusForFortDefenseMult(FORT_TIER_LADDER.THUNDER_BASTION.defenseMult);
    expect(wooden).toBeLessThan(fort);
    expect(fort).toBeLessThan(ironBastion);
    expect(ironBastion).toBeLessThan(thunderBastion);
  });

  test("town garrison bonus is a modest flat contribution, well below a full side", () => {
    expect(TOWN_GARRISON_BONUS).toBeGreaterThan(0);
    expect(TOWN_GARRISON_BONUS).toBeLessThan(LOCAL_SUPPORT_MAX_SIDES);
  });
});

describe("empireIntegrity", () => {
  test("passes through an already-clamped aggregate unchanged", () => {
    expect(empireIntegrity(0)).toBe(0);
    expect(empireIntegrity(0.5)).toBe(0.5);
    expect(empireIntegrity(1)).toBe(1);
  });

  test("defensively clamps out-of-range input", () => {
    expect(empireIntegrity(-0.2)).toBe(0);
    expect(empireIntegrity(1.2)).toBe(1);
  });
});

describe("integrity multipliers respond to real shape, not a fixed ~50% (the bug this replaces)", () => {
  test("a maximally sprawling empire (score near 0) takes the full penalty", () => {
    const t = empireIntegrity(0);
    expect(integrityEconomyMult(t)).toBeCloseTo(0.85, 5);
    expect(integrityGrowthMult(t)).toBeCloseTo(0.9, 5);
  });

  test("a maximally compact/garrisoned empire (score at 1) gets the full bonus", () => {
    const t = empireIntegrity(1);
    expect(integrityEconomyMult(t)).toBeCloseTo(1.15, 5);
    expect(integrityGrowthMult(t)).toBeCloseTo(1.1, 5);
  });

  test("an ordinary mid-shaped empire is not pinned to the midpoint — it moves with its actual score", () => {
    const sparse = empireIntegrity(0.25);
    const dense = empireIntegrity(0.75);
    expect(integrityEconomyMult(sparse)).toBeLessThan(integrityEconomyMult(dense));
    expect(integrityGrowthMult(sparse)).toBeLessThan(integrityGrowthMult(dense));
  });
});
