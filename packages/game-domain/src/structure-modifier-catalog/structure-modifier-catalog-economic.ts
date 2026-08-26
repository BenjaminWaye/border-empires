// Economic/support-building modifier entries — split from the military
// family (structure-modifier-catalog-military.ts) to keep files under the
// repo's 500-line cap. Numbers come from the existing shared/game-domain
// constants (no duplicated magic numbers).
import {
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY, CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT,
  GARRISON_HALL_MANPOWER_CAP_BONUS, GRANARY_INSTANT_POPULATION_BURST, QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT,
  RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL, TILE_SLOT_BOOST_STRUCTURES, WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS
} from "@border-empires/shared";
import {
  FOUNDRY_OUTPUT_MULT, GOVERNORS_OFFICE_RADIUS, GRANARY_ONGOING_GROWTH_MULT, LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE,
  MINTWORKS_FLAT_GOLD_BONUS_PER_MIN, MINTWORKS_GOLD_PRODUCTION_BONUS, MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE,
  MINTWORKS_INSTANT_GOLD_BONUS, RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD,
  UPKEEP_MINUTES_PER_DAY
} from "../server-game-constants/server-game-constants.js";
import { multiplierPercentLabel, percentLabel, type ModifierContext, type ModifierStructureType, type StructureModifier } from "./structure-modifier-catalog-types.js";

const mintworksModifiers = (ctx: ModifierContext): StructureModifier[] => {
  const count = ctx.tile?.town?.mintworksCount;
  const clearingHouseActive = Boolean(ctx.tile?.town?.clearingHouseActive);
  const perCopyPercent = (clearingHouseActive ? MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE : MINTWORKS_GOLD_PRODUCTION_BONUS) * 100;
  const goldPerDay = Math.round(MINTWORKS_FLAT_GOLD_BONUS_PER_MIN * UPKEEP_MINUTES_PER_DAY);
  const hasLiveCount = typeof count === "number" && count > 0;
  const stackedValueText = hasLiveCount
    ? `${percentLabel(perCopyPercent * count)} town gold production`
    : `${percentLabel(perCopyPercent)} town gold production per Mintworks`;
  return [
    { statLabel: "Instant gold", valueText: `+${MINTWORKS_INSTANT_GOLD_BONUS} (once, on completion)`, tone: "positive", isTownWide: true },
    { statLabel: "Gold", valueText: `+${goldPerDay}/day`, tone: "positive", isTownWide: true, rawValue: goldPerDay },
    // Nonlinear stacking (each copy is worth more with an active Clearing
    // House) means the aggregate total can't be derived by multiplying a
    // flat per-copy rawValue by count like the other town-wide modifiers —
    // it's already computed above from the live count, so rawValue carries
    // the final total percent directly (alreadyAggregated: true tells the
    // town-summary aggregator not to multiply it again).
    {
      statLabel: "Gold production",
      valueText: stackedValueText,
      tone: "positive",
      isTownWide: true,
      ...(hasLiveCount ? { rawValue: perCopyPercent * count, unit: "percent" as const, alreadyAggregated: true } : {})
    }
  ];
};

// FOOD/TITANIUM/CRYSTAL/UMBRITE production caps were retired by the
// resource-slot rewrite (§5) — Mine's only live effect is +1 slot of its
// tile's resource (TILE_SLOT_BOOST_STRUCTURES.MINE, structure-slots.ts).
const mineModifiers = (ctx: ModifierContext): StructureModifier[] => {
  const resource = ctx.tile?.resource;
  const slotLabel = resource === "GEMS" ? "CRYSTAL slot" : resource === "TITANIUM" ? "TITANIUM slot" : "resource slot";
  return [{ statLabel: slotLabel, valueText: `+${TILE_SLOT_BOOST_STRUCTURES.MINE}`, tone: "positive", isTownWide: false }];
};

// The *_PER_DAY constants below describe a daily production rate that the
// resource-slot rewrite (§5) retired — converterOutputPerMinute
// (player-update-economy.ts) returns {} for SYNTHESIZE mode, so no daily
// resource output is ever actually produced. The real live Refine-mode
// effect is a flat +1 slot supply of the family resource
// (isSlotSourceConverter, resource-slot-view.ts).
const synthesizerModifiers = (type: ModifierStructureType): StructureModifier[] | undefined => {
  const byType: Partial<Record<ModifierStructureType, string>> = {
    UMBRITE_SYNTHESIZER: "UMBRITE",
    ADVANCED_UMBRITE_SYNTHESIZER: "UMBRITE",
    TITANIUM_WORKS: "TITANIUM",
    ADVANCED_TITANIUM_WORKS: "TITANIUM",
    CRYSTAL_SYNTHESIZER: "CRYSTAL",
    ADVANCED_CRYSTAL_SYNTHESIZER: "CRYSTAL"
  };
  const resource = byType[type];
  if (!resource) return undefined;
  return [{ statLabel: "Refine mode supplies", valueText: `+1 ${resource} slot`, tone: "positive", isTownWide: false }];
};

export const economicStructureModifiers = (type: ModifierStructureType, ctx: ModifierContext): StructureModifier[] | undefined => {
  // "+50% farm food" was retired by the resource-slot rewrite (§5) —
  // strategicProductionPerMinuteForResource (player-update-economy.ts) always
  // returns 0, and farmsteadFoodBonusPerMinute (tile-yield-view.ts), the one
  // function that would compute this, has no callers anywhere. Farmstead's
  // only live effect is the FOOD slot below.
  if (type === "FARMSTEAD") {
    return [
      { statLabel: "FOOD slot", valueText: `+${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD}`, tone: "positive", isTownWide: false }
    ];
  }
  if (type === "WATERWORKS") {
    return [
      { statLabel: "Farmstead food (10-tile radius)", valueText: "+100%", tone: "positive", isTownWide: false },
      { statLabel: "FOOD slots per boosted Farmstead", valueText: `+${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS}`, tone: "positive", isTownWide: false }
    ];
  }
  // Same retirement as Mine — no ongoing production/cap left, just +1 slot.
  if (type === "UMBRITE_RIG") {
    return [{ statLabel: "UMBRITE slot", valueText: `+${TILE_SLOT_BOOST_STRUCTURES.UMBRITE_RIG}`, tone: "positive", isTownWide: false }];
  }
  if (type === "MINE") return mineModifiers(ctx);
  if (type === "MINTWORKS") return mintworksModifiers(ctx);
  if (type === "GRANARY") {
    return [
      { statLabel: "Population", valueText: `+${GRANARY_INSTANT_POPULATION_BURST.toLocaleString()} (once, on completion)`, tone: "positive", isTownWide: true },
      { statLabel: "Population growth", valueText: multiplierPercentLabel(GRANARY_ONGOING_GROWTH_MULT), tone: "positive", isTownWide: true }
    ];
  }
  if (type === "SEED_GRANARY") {
    return [{ statLabel: "Population growth", valueText: "+30%", tone: "positive", isTownWide: true }];
  }
  if (type === "CENSUS_HALL") {
    return [
      { statLabel: "Population per connected Incubation Engine", valueText: `+${CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY.toLocaleString()}`, tone: "positive", isTownWide: true },
      { statLabel: "Town-tier upgrade cost", valueText: percentLabel(-(1 - CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT) * 100), tone: "positive", isTownWide: true }
    ];
  }
  if (type === "CLEARING_HOUSE") {
    // "+25%" alone read as +25% of gold production, when it's really a jump
    // from +10% to +35% gold bonus per Mintworks copy — spell out both ends
    // so the size of the buff is unambiguous.
    return [{
      statLabel: "Mintworks gold bonus per copy",
      valueText: `${percentLabel(MINTWORKS_GOLD_PRODUCTION_BONUS * 100)} → ${percentLabel(MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE * 100)}`,
      tone: "positive",
      isTownWide: true
    }];
  }
  // The real connected-town bonus (connectedTownBonusForPlayer, economy-network.ts)
  // is a stepped ladder — +50%/+40%/+30% for the 1st/2nd/3rd connected town,
  // summed additively, capped at 3 towns — not a flat percentage. Caravanary
  // is the network's gate for this bonus (networkHasCaravanary), not its
  // source, so no single per-copy number applies here.
  if (type === "CARAVANARY") return [{ statLabel: "Connected-town gold bonus", valueText: "+50% / +40% / +30% (1st–3rd connected town)", tone: "positive", isTownWide: true }];
  if (type === "CUSTOMS_HOUSE") return [{ statLabel: "Gold / day per connected owned dock", valueText: "+5", tone: "positive", isTownWide: true }];
  if (type === "FOUNDRY") return [{ statLabel: "Mine output (5-tile radius)", valueText: `${FOUNDRY_OUTPUT_MULT}x`, tone: "positive", isTownWide: true }];
  if (type === "GOVERNORS_OFFICE") {
    return [
      { statLabel: `Nearby town FOOD slot demand (${GOVERNORS_OFFICE_RADIUS}-tile radius)`, valueText: "-1 tier step", tone: "positive", isTownWide: true }
    ];
  }
  if (type === "GARRISON_HALL") {
    return [{ statLabel: "Manpower cap", valueText: `+${GARRISON_HALL_MANPOWER_CAP_BONUS}`, tone: "positive", isTownWide: true, rawValue: GARRISON_HALL_MANPOWER_CAP_BONUS }];
  }
  // Rail Depot only amplifies Logistics Guild manpower regen — the
  // tech-tree redesign moved manpower-cap network amplification to Assembly
  // Works exclusively (see runtime-manpower.ts's
  // playerManpowerCapFromSummary: assemblyWorksNetworkGarrisonHallCount,
  // "Rail Depot no longer touches it"). Don't add a manpower-cap line here.
  if (type === "RAIL_DEPOT") {
    return [{ statLabel: "Manpower/min per Logistics Guild in network", valueText: `+${RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD}`, tone: "positive", isTownWide: true }];
  }
  if (type === "QUARTERMASTERS_OFFICE") return [{ statLabel: "War-structure manpower cost (20-tile radius)", valueText: percentLabel(-(1 - QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT) * 100), tone: "positive", isTownWide: true }];
  if (type === "LOGISTICS_GUILD") {
    return [{ statLabel: "Manpower/min empire-wide", valueText: `+${LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE}`, tone: "positive", isTownWide: true, rawValue: LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE }];
  }
  if (type === "ASSEMBLY_WORKS") {
    return [{
      statLabel: "Manpower cap per Ancillary Factory in network",
      valueText: `+${RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL}`,
      tone: "positive",
      isTownWide: true
    }];
  }
  const synth = synthesizerModifiers(type);
  if (synth) return synth;
  return undefined;
};
