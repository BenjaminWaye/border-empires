import { describe, expect, it } from "vitest";
import {
  MANPOWER_BASE_CAP as SHARED_MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE as SHARED_MANPOWER_BASE_REGEN_PER_MINUTE,
  manpowerRegenWeightForSettlementIndex as sharedManpowerRegenWeightForSettlementIndex,
  TOWN_MANPOWER_BY_TIER as SHARED_TOWN_MANPOWER_BY_TIER
} from "@border-empires/shared";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CONVERTER_MODE_FLIP_COOLDOWN_MS,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  EXCHANGE_GOLD_PER_SLOT_PER_DAY,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
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

  it("keeps EXCHANGE gold per slot below each family's SYNTHESIZE gold upkeep per day (basic and Advanced tiers)", () => {
    const families = [
      {
        resource: "UMBRITE",
        exchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.UMBRITE_SYNTHESIZER,
        upkeep: UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
        advancedExchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.ADVANCED_UMBRITE_SYNTHESIZER,
        advancedUpkeep: ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY
      },
      {
        resource: "TITANIUM",
        exchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.TITANIUM_WORKS,
        upkeep: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
        advancedExchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.ADVANCED_TITANIUM_WORKS,
        advancedUpkeep: ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY
      },
      {
        resource: "CRYSTAL",
        exchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.CRYSTAL_SYNTHESIZER,
        upkeep: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
        advancedExchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.ADVANCED_CRYSTAL_SYNTHESIZER,
        advancedUpkeep: ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY
      }
    ] as const;
    for (const family of families) {
      expect(family.exchange, `${family.resource} basic sell-off must earn less than its basic Refine upkeep`).toBeLessThan(family.upkeep);
      expect(family.advancedExchange, `${family.resource} Advanced sell-off must earn less than its Advanced Refine upkeep`).toBeLessThan(family.advancedUpkeep);
      // Gating against the basic tier's upkeep is the strict bound (plan
      // §Balance invariant): Advanced upkeep is always higher, so an
      // Advanced-tier exchange payout below the *basic* upkeep is doubly
      // safe against a basic-tier synth in the cross-building loop.
      expect(family.exchange).toBeLessThan(family.upkeep);
    }
  });

  // §Balance invariant "headroom caveat": no tech/domain effect sets
  // player.mods?.income today (verified stacked max is exactly 1x across
  // tech-tree.json/domain-tree.json), but exchange payout routes through it
  // while synth upkeep does not. Assert the bound against a ceiling, not the
  // base rate, so a future income-multiplier tech that eats this headroom
  // fails loudly here instead of silently opening the gold->slot->gold loop
  // in production. 3.5x is comfortably above today's real ceiling (1x) and
  // comfortably below the loop-opening thresholds implied by the locked
  // rates (~3.75x for TITANIUM/UMBRITE, ~4.0x for CRYSTAL).
  const ASSUMED_MAX_INCOME_MULT_HEADROOM = 3.5;

  it("holds the balance invariant even against a future income multiplier up to the assumed headroom ceiling", () => {
    const families = [
      { resource: "UMBRITE", exchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.UMBRITE_SYNTHESIZER, upkeep: UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY },
      { resource: "TITANIUM", exchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.TITANIUM_WORKS, upkeep: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY },
      { resource: "CRYSTAL", exchange: EXCHANGE_GOLD_PER_SLOT_PER_DAY.CRYSTAL_SYNTHESIZER, upkeep: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY }
    ] as const;
    for (const family of families) {
      expect(
        family.exchange * ASSUMED_MAX_INCOME_MULT_HEADROOM,
        `${family.resource} exchange payout x ${ASSUMED_MAX_INCOME_MULT_HEADROOM}x income must still lose to synth upkeep`
      ).toBeLessThan(family.upkeep);
    }
  });

  it("requires a positive flip cooldown so mode flips cannot be chained in one tick", () => {
    expect(CONVERTER_MODE_FLIP_COOLDOWN_MS).toBeGreaterThan(0);
  });
});
