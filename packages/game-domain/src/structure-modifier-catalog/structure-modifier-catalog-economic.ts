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
  FOUNDRY_OUTPUT_MULT, GOVERNORS_OFFICE_RADIUS, LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE,
  MINTWORKS_FLAT_GOLD_BONUS_PER_MIN, MINTWORKS_GOLD_PRODUCTION_BONUS, MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE,
  MINTWORKS_INSTANT_GOLD_BONUS, RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD,
  UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY, ADVANCED_UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY,
  TITANIUM_WORKS_TITANIUM_PER_DAY, ADVANCED_TITANIUM_WORKS_TITANIUM_PER_DAY,
  CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY, ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY,
  UPKEEP_MINUTES_PER_DAY
} from "../server-game-constants/server-game-constants.js";
import { percentLabel, type ModifierContext, type ModifierStructureType, type StructureModifier } from "./structure-modifier-catalog-types.js";

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

const mineModifiers = (ctx: ModifierContext): StructureModifier[] => {
  const resource = ctx.tile?.resource;
  const productionLabel = resource === "TITANIUM" ? "+50% titanium production" : resource === "GEMS" ? "+50% crystal production" : "+50% strategic resource production";
  return [
    { statLabel: "Production", valueText: productionLabel, tone: "positive", isTownWide: false },
    { statLabel: "Resource cap", valueText: resource === "GEMS" ? "+9 crystal cap" : "+15 cap", tone: "positive", isTownWide: false }
  ];
};

const synthesizerModifiers = (type: ModifierStructureType): StructureModifier[] | undefined => {
  const byType: Partial<Record<ModifierStructureType, { refine: number; resource: string }>> = {
    UMBRITE_SYNTHESIZER: { refine: UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY, resource: "umbrite" },
    ADVANCED_UMBRITE_SYNTHESIZER: { refine: ADVANCED_UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY, resource: "umbrite" },
    TITANIUM_WORKS: { refine: TITANIUM_WORKS_TITANIUM_PER_DAY, resource: "titanium" },
    ADVANCED_TITANIUM_WORKS: { refine: ADVANCED_TITANIUM_WORKS_TITANIUM_PER_DAY, resource: "titanium" },
    CRYSTAL_SYNTHESIZER: { refine: CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY, resource: "crystal" },
    ADVANCED_CRYSTAL_SYNTHESIZER: { refine: ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY, resource: "crystal" }
  };
  const entry = byType[type];
  if (!entry) return undefined;
  return [{ statLabel: "Refine rate", valueText: `${entry.refine}/day ${entry.resource}`, tone: "positive", isTownWide: false }];
};

export const economicStructureModifiers = (type: ModifierStructureType, ctx: ModifierContext): StructureModifier[] | undefined => {
  if (type === "FARMSTEAD") {
    return [
      { statLabel: "Farm food", valueText: "+50%", tone: "positive", isTownWide: false },
      { statLabel: "FOOD slot", valueText: `+${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD}`, tone: "positive", isTownWide: false }
    ];
  }
  if (type === "WATERWORKS") {
    return [
      { statLabel: "Farmstead food (10-tile radius)", valueText: "+100%", tone: "positive", isTownWide: false },
      { statLabel: "FOOD slots per boosted Farmstead", valueText: `+${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS}`, tone: "positive", isTownWide: false }
    ];
  }
  if (type === "UMBRITE_RIG") {
    return [
      { statLabel: "Umbrite production", valueText: "+50%", tone: "positive", isTownWide: false },
      { statLabel: "Umbrite cap", valueText: "+15", tone: "positive", isTownWide: false }
    ];
  }
  if (type === "MINE") return mineModifiers(ctx);
  if (type === "MINTWORKS") return mintworksModifiers(ctx);
  if (type === "GRANARY") return [{ statLabel: "Population", valueText: `+${GRANARY_INSTANT_POPULATION_BURST.toLocaleString()} (once, on completion)`, tone: "positive", isTownWide: true }];
  if (type === "SEED_GRANARY") {
    return [
      { statLabel: "Population growth", valueText: "+30%", tone: "positive", isTownWide: true },
      { statLabel: "Food upkeep", valueText: "-10%", tone: "positive", isTownWide: true }
    ];
  }
  if (type === "CENSUS_HALL") {
    return [
      { statLabel: "Population per connected Incubation Engine", valueText: `+${CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY.toLocaleString()}`, tone: "positive", isTownWide: true },
      { statLabel: "Town-tier upgrade cost", valueText: percentLabel(-(1 - CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT) * 100), tone: "positive", isTownWide: true }
    ];
  }
  if (type === "CLEARING_HOUSE") {
    return [{ statLabel: "Mintworks effect", valueText: percentLabel((MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE - MINTWORKS_GOLD_PRODUCTION_BONUS) * 100), tone: "positive", isTownWide: true }];
  }
  if (type === "CARAVANARY") return [{ statLabel: "Connected-town gold production", valueText: "+25%", tone: "positive", isTownWide: true }];
  if (type === "CUSTOMS_HOUSE") return [{ statLabel: "Gold / minute per connected owned dock", valueText: "+1", tone: "positive", isTownWide: true }];
  if (type === "FOUNDRY") return [{ statLabel: "Mine output (5-tile radius)", valueText: `${FOUNDRY_OUTPUT_MULT}x`, tone: "positive", isTownWide: true }];
  if (type === "GOVERNORS_OFFICE") {
    return [
      { statLabel: "Food upkeep", valueText: "-10%", tone: "positive", isTownWide: true },
      { statLabel: `Nearby town FOOD slot demand (${GOVERNORS_OFFICE_RADIUS}-tile radius)`, valueText: "-1 tier step", tone: "positive", isTownWide: true }
    ];
  }
  if (type === "GARRISON_HALL") {
    return [{ statLabel: "Manpower cap", valueText: `+${GARRISON_HALL_MANPOWER_CAP_BONUS}`, tone: "positive", isTownWide: true, rawValue: GARRISON_HALL_MANPOWER_CAP_BONUS }];
  }
  if (type === "RAIL_DEPOT") {
    return [
      { statLabel: "Manpower/min per Logistics Guild in network", valueText: `+${RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD}`, tone: "positive", isTownWide: true },
      { statLabel: "Manpower cap per Garrison Hall in network", valueText: `+${RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL}`, tone: "positive", isTownWide: true }
    ];
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
