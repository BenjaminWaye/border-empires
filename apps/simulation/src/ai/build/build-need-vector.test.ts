import { describe, expect, it } from "vitest";

import { GOLD_RESCALE_DIVISOR } from "@border-empires/game-domain";
import { computeNeedVector, type NeedVectorInput } from "./build-need-vector.js";

const baseInput: NeedVectorInput = {
  manpower: 100,
  manpowerCapacity: 1_000,
  manpowerRegenPerMinute: 2,
  settledTileCount: 10,
  incomePerMinute: 1,
  slotSupplyByResource: {},
  slotDemandByResource: {},
  frontierEnemyTargetCount: 0,
  stalematedTargetCount: 0,
  ownedForts: 0,
  ownedSiegeOutposts: 0,
  victoryPathProgress: 0.5
};

describe("computeNeedVector", () => {
  it("returns every deficit clamped to [0, 1]", () => {
    const result = computeNeedVector({
      ...baseInput,
      manpowerRegenPerMinute: 0,
      incomePerMinute: 0,
      slotSupplyByResource: { FOOD: 0 },
      slotDemandByResource: { FOOD: 10 },
      frontierEnemyTargetCount: 50,
      stalematedTargetCount: 50,
      victoryPathProgress: -5 // pathologically over-shot; must still clamp
    });
    for (const value of Object.values(result)) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  describe("MANPOWER_THROUGHPUT", () => {
    it("is ~0 when regen matches or exceeds the settled-tile-scaled target", () => {
      // target = 0.08*10 + 0.4 = 1.2 (float arithmetic, hence toBeCloseTo)
      const result = computeNeedVector({ ...baseInput, settledTileCount: 10, manpowerRegenPerMinute: 1.2 });
      expect(result.MANPOWER_THROUGHPUT).toBeCloseTo(0, 10);
    });

    it("is 1 when regen is zero", () => {
      const result = computeNeedVector({ ...baseInput, manpowerRegenPerMinute: 0 });
      expect(result.MANPOWER_THROUGHPUT).toBe(1);
    });

    it("scales with settled tile count, not just a flat floor", () => {
      const small = computeNeedVector({ ...baseInput, settledTileCount: 1, manpowerRegenPerMinute: 1 });
      const large = computeNeedVector({ ...baseInput, settledTileCount: 100, manpowerRegenPerMinute: 1 });
      // Same regen, much larger empire -> the target grew, so the deficit is worse.
      expect(large.MANPOWER_THROUGHPUT).toBeGreaterThan(small.MANPOWER_THROUGHPUT);
    });
  });

  describe("MANPOWER_CEILING", () => {
    it("is 0 well below the cap", () => {
      const result = computeNeedVector({ ...baseInput, manpower: 100, manpowerCapacity: 1_000 });
      expect(result.MANPOWER_CEILING).toBe(0);
    });

    it("is 0 exactly at the start of the pin band (90% of cap)", () => {
      const result = computeNeedVector({ ...baseInput, manpower: 900, manpowerCapacity: 1_000 });
      expect(result.MANPOWER_CEILING).toBe(0);
    });

    it("ramps to 1 as manpower approaches the cap", () => {
      const mid = computeNeedVector({ ...baseInput, manpower: 950, manpowerCapacity: 1_000 });
      const atCap = computeNeedVector({ ...baseInput, manpower: 1_000, manpowerCapacity: 1_000 });
      expect(mid.MANPOWER_CEILING).toBeCloseTo(0.5, 5);
      expect(atCap.MANPOWER_CEILING).toBe(1);
    });

    it("is 0 (not NaN/Infinity) when capacity is 0", () => {
      const result = computeNeedVector({ ...baseInput, manpower: 0, manpowerCapacity: 0 });
      expect(result.MANPOWER_CEILING).toBe(0);
    });
  });

  describe("slot needs", () => {
    it("is 0 when nothing demands the resource, even with zero supply", () => {
      const result = computeNeedVector({
        ...baseInput,
        slotSupplyByResource: { TITANIUM: 0 },
        slotDemandByResource: {}
      });
      expect(result.TITANIUM_SLOTS).toBe(0);
    });

    it("is 0 when supply covers demand", () => {
      const result = computeNeedVector({
        ...baseInput,
        slotSupplyByResource: { UMBRITE: 5 },
        slotDemandByResource: { UMBRITE: 5 }
      });
      expect(result.UMBRITE_SLOTS).toBe(0);
    });

    it("is 1 when there is demand and zero supply", () => {
      const result = computeNeedVector({
        ...baseInput,
        slotSupplyByResource: {},
        slotDemandByResource: { CRYSTAL: 3 }
      });
      expect(result.CRYSTAL_SLOTS).toBe(1);
    });

    it("scores each resource independently", () => {
      const result = computeNeedVector({
        ...baseInput,
        slotSupplyByResource: { FOOD: 10, TITANIUM: 0 },
        slotDemandByResource: { FOOD: 10, TITANIUM: 4 }
      });
      expect(result.FOOD_SLOTS).toBe(0);
      expect(result.TITANIUM_SLOTS).toBe(1);
    });
  });

  describe("GOLD", () => {
    it("is 0 when income meets the settled-tile-scaled target", () => {
      // target = max(8, 10*0.55) / GOLD_RESCALE_DIVISOR = 8 / divisor
      const result = computeNeedVector({
        ...baseInput,
        settledTileCount: 10,
        incomePerMinute: 8 / GOLD_RESCALE_DIVISOR
      });
      expect(result.GOLD).toBe(0);
    });

    it("is 1 when income is zero", () => {
      const result = computeNeedVector({ ...baseInput, incomePerMinute: 0 });
      expect(result.GOLD).toBe(1);
    });
  });

  describe("DEFENSE", () => {
    it("is 0 with no frontier enemies regardless of forts owned", () => {
      const result = computeNeedVector({ ...baseInput, frontierEnemyTargetCount: 0, ownedForts: 0 });
      expect(result.DEFENSE).toBe(0);
    });

    it("scales down as owned forts increase for the same enemy pressure", () => {
      const noForts = computeNeedVector({ ...baseInput, frontierEnemyTargetCount: 1, ownedForts: 0 });
      const oneFort = computeNeedVector({ ...baseInput, frontierEnemyTargetCount: 1, ownedForts: 1 });
      expect(noForts.DEFENSE).toBe(1); // 1 / max(1, 0) = 1
      expect(oneFort.DEFENSE).toBe(0.5); // 1 / max(1, 2) = 0.5
      expect(oneFort.DEFENSE).toBeLessThan(noForts.DEFENSE);
    });
  });

  describe("OFFENSE", () => {
    it("is 0 with no stalemated targets", () => {
      const result = computeNeedVector({ ...baseInput, stalematedTargetCount: 0, ownedSiegeOutposts: 0 });
      expect(result.OFFENSE).toBe(0);
    });

    it("is positive even with zero owned outposts (denominator floors at 1)", () => {
      const result = computeNeedVector({ ...baseInput, stalematedTargetCount: 1, ownedSiegeOutposts: 0 });
      expect(result.OFFENSE).toBe(1);
    });
  });

  describe("VICTORY", () => {
    it("is the complement of victoryPathProgress", () => {
      expect(computeNeedVector({ ...baseInput, victoryPathProgress: 0 }).VICTORY).toBe(1);
      expect(computeNeedVector({ ...baseInput, victoryPathProgress: 1 }).VICTORY).toBe(0);
      expect(computeNeedVector({ ...baseInput, victoryPathProgress: 0.25 }).VICTORY).toBeCloseTo(0.75, 5);
    });
  });
});
