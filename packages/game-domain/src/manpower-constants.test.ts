import { describe, expect, it } from "vitest";
import {
  MANPOWER_BASE_CAP as SHARED_MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE as SHARED_MANPOWER_BASE_REGEN_PER_MINUTE,
  manpowerRegenWeightForSettlementIndex as sharedManpowerRegenWeightForSettlementIndex,
  TOWN_MANPOWER_BY_TIER as SHARED_TOWN_MANPOWER_BY_TIER
} from "@border-empires/shared";
import {
  MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE,
  manpowerRegenWeightForSettlementIndex,
  TOWN_MANPOWER_BY_TIER
} from "./server-game-constants.js";

describe("manpower constants", () => {
  it("keeps game-domain manpower regen aligned with shared balance constants", () => {
    expect(MANPOWER_BASE_CAP).toBe(SHARED_MANPOWER_BASE_CAP);
    expect(MANPOWER_BASE_REGEN_PER_MINUTE).toBe(SHARED_MANPOWER_BASE_REGEN_PER_MINUTE);
    expect(TOWN_MANPOWER_BY_TIER).toEqual(SHARED_TOWN_MANPOWER_BY_TIER);
    expect(manpowerRegenWeightForSettlementIndex).toBe(sharedManpowerRegenWeightForSettlementIndex);
    expect(MANPOWER_BASE_CAP / MANPOWER_BASE_REGEN_PER_MINUTE).toBeCloseTo(720, 10);
    for (const tier of Object.keys(TOWN_MANPOWER_BY_TIER) as Array<keyof typeof TOWN_MANPOWER_BY_TIER>) {
      const { cap, regenPerMinute } = TOWN_MANPOWER_BY_TIER[tier];
      expect(cap / regenPerMinute).toBeCloseTo(720, 10);
    }
  });
});
