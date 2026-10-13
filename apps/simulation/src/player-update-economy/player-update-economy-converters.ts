// Split out of player-update-economy.ts (crossed the repo's 500-line cap) —
// pure per-structure converter output/upkeep formulas, self-contained and
// unrelated to the snapshot-builder loop they're consumed by.
import {
  HIGH_YIELD_AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY,
  HIGH_YIELD_UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY,
  HIGH_YIELD_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY,
  EXCHANGE_GOLD_PER_SLOT_PER_DAY,
  UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  UPKEEP_MINUTES_PER_DAY,
  type DomainStrategicResourceKey
} from "@border-empires/game-domain";
import { SYNTHESIZER_TYPE_SET, SYNTHESIZER_FAMILY_RESOURCE, type BuildableStructureType } from "@border-empires/shared";

type EconomyResourceKey = DomainStrategicResourceKey | "GOLD";

// TITANIUM_WORKS/UMBRITE_WORKS/AETHER_CONDENSER no longer produce a stockpiled
// resource (§5.6); EXCHANGE-mode converters produce gold from a slot instead.
export const converterOutputPerMinute = (structureType: string, mode?: string): Partial<Record<EconomyResourceKey, number>> => {
  if (SYNTHESIZER_TYPE_SET.has(structureType as BuildableStructureType) && mode === "EXCHANGE") {
    const family = SYNTHESIZER_FAMILY_RESOURCE[structureType as keyof typeof SYNTHESIZER_FAMILY_RESOURCE];
    if (family) {
      // EXCHANGE mode produces gold, not a strategic resource
      const goldPerDay = EXCHANGE_GOLD_PER_SLOT_PER_DAY[structureType as keyof typeof EXCHANGE_GOLD_PER_SLOT_PER_DAY] ?? 0;
      return { GOLD: goldPerDay / UPKEEP_MINUTES_PER_DAY };
    }
  }
  return {};
};

export const structureUpkeepPerMinute = (structureType: string, mode?: string): Partial<Record<EconomyResourceKey, number>> => {
  // EXCHANGE-mode converters have no gold upkeep (they are a gold source)
  if (SYNTHESIZER_TYPE_SET.has(structureType as BuildableStructureType) && mode === "EXCHANGE") {
    return {};
  }
  switch (structureType) {
    // Every structure except the synthesizer family (Umbrite/Titanium/Crystal +
    // Advanced tiers, §6.4) has zero ongoing upkeep: FOOD/TITANIUM/CRYSTAL/UMBRITE
    // are slot-based (structure-slots.ts), not a per-minute drain, and only
    // the synthesizers still have a real GOLD cost for their conversion.
    case "UMBRITE_WORKS": return { GOLD: UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "HIGH_YIELD_UMBRITE_WORKS": return { GOLD: HIGH_YIELD_UMBRITE_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "TITANIUM_WORKS": return { GOLD: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "HIGH_YIELD_TITANIUM_WORKS": return { GOLD: HIGH_YIELD_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "AETHER_CONDENSER": return { GOLD: AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    case "HIGH_YIELD_AETHER_CONDENSER": return { GOLD: HIGH_YIELD_AETHER_CONDENSER_GOLD_UPKEEP_PER_DAY / UPKEEP_MINUTES_PER_DAY };
    default: return {};
  }
};
