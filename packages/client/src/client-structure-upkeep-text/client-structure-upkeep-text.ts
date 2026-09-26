// Real ongoing upkeep for any buildable structure type, as display bits --
// single source of truth for the build-menu action list
// (client-tile-action-logic.ts), the structure-info modal
// (client-map-display.ts's structureInfoForKey), and the dormant-structure
// warning line (client-tile-menu-dormancy-line.ts). Previously three
// separate, driftable copies of the same "what does this cost to keep
// running" logic -- an ad hoc per-building suffix, a local upkeepBitsFor
// closure, and a flat structureSlotRequirements("OBSERVATORY") read that
// never accounted for the Observatory's progressive cost.
import {
  RELAY_BEACON_FREE_FOOD_SLOT_COUNT,
  observatoryCrystalSlotCostForOwnedCount,
  structureSlotRequirements,
  type BuildableStructureType,
  type SlotStructureType,
  type StructureSlotRequirement
} from "@border-empires/shared";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY
} from "@border-empires/game-domain";

// Only the six synthesizer types have any real, ongoing gold upkeep in the
// simulation (apps/simulation/src/player-update-economy/
// player-update-economy-converters.ts's structureUpkeepPerMinute) -- every
// other structure's real per-minute drain was retired to 0 by the
// manpower-economy rewrite, so no gold/day line applies to it.
const SYNTHESIZER_GOLD_UPKEEP_PER_DAY: Partial<Record<BuildableStructureType, number>> = {
  UMBRITE_SYNTHESIZER: UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_UMBRITE_SYNTHESIZER: ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  TITANIUM_WORKS: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS: ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  CRYSTAL_SYNTHESIZER: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_CRYSTAL_SYNTHESIZER: ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY
};

// `ownedCountOfType` is "how many of this exact type does the player already
// own" -- used for the two upkeep rules that move per copy instead of being
// a flat per-structure number:
//  - OBSERVATORY: progressive CRYSTAL cost (observatoryCrystalSlotCostForOwnedCount
//    -- the single shared formula, also used server-side by
//    apps/simulation's resource-slot-view.ts).
//  - RELAY_BEACON: the player's first RELAY_BEACON_FREE_FOOD_SLOT_COUNT
//    copies need zero FOOD slots (server-side waiver, slot-waivers.ts) --
//    omitted entirely here rather than showing a cost that won't be charged.
// Leaving it undefined for either type falls back to the flat/worst-case
// requirement (1 CRYSTAL slot for a first Observatory, 1 FOOD slot for a
// beyond-the-waiver Relay Beacon).
export const upkeepDescriptorFor = (type: SlotStructureType, ownedCountOfType?: number): string[] => {
  const bits: string[] = [];
  const relayBeaconWaived =
    type === "RELAY_BEACON" && ownedCountOfType !== undefined && ownedCountOfType < RELAY_BEACON_FREE_FOOD_SLOT_COUNT;
  if (!relayBeaconWaived) {
    const requirements: StructureSlotRequirement[] =
      type === "OBSERVATORY"
        ? [{ resource: "CRYSTAL", count: observatoryCrystalSlotCostForOwnedCount(ownedCountOfType ?? 0) }]
        : structureSlotRequirements(type);
    for (const requirement of requirements) {
      bits.push(`${requirement.count} ${requirement.resource} slot${requirement.count === 1 ? "" : "s"}`);
    }
  }
  const goldPerDay = SYNTHESIZER_GOLD_UPKEEP_PER_DAY[type as BuildableStructureType];
  if (goldPerDay !== undefined) bits.push(`${goldPerDay} gold/day`);
  return bits;
};

// Convenience wrapper for callers assembling a single "Upkeep: ..." segment
// (the build-menu action list) rather than a modal's bulleted list.
export const upkeepSuffixFor = (type: SlotStructureType, ownedCountOfType?: number): string => {
  const bits = upkeepDescriptorFor(type, ownedCountOfType);
  return bits.length > 0 ? ` • Upkeep: ${bits.join(" · ")}` : "";
};
