import { manpowerPerBatch } from "@border-empires/shared";
// Economic/support-building modifier entries — split from the military
// family (structure-modifier-catalog-military.ts) to keep files under the
// repo's 500-line cap. Numbers come from the existing shared/game-domain
// constants (no duplicated magic numbers).
import {
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE, CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT,
  ANCILLARY_DEPOT_MANPOWER_CAP_BONUS, INCUBATION_ENGINE_INSTANT_POPULATION_BURST,
  TILE_SLOT_BOOST_STRUCTURES, HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS, REFINERY_BOOSTER_SLOTS_PER_TILE, REFINERY_REACH_LAND_TILES, REFINERY_SLOTS_PER_TILE,
  isRefineryBoosterType, isRefineryType
} from "@border-empires/shared";
import {
  EXCHANGE_GOLD_PER_SLOT_PER_DAY, MINISTRY_HALL_RADIUS, INCUBATION_ENGINE_ONGOING_GROWTH_MULT,
  ANCILLARY_FACTORY_STANDALONE_REGEN_PER_MINUTE, MANUFACTORY_FLAT_GOLD_BONUS_PER_MIN, MANUFACTORY_GOLD_PRODUCTION_BONUS,
  MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE, MANUFACTORY_INSTANT_GOLD_BONUS,
  NEURAL_WORKS_NETWORK_MANPOWER_REGEN_PER_ANCILLARY_FACTORY, UPKEEP_MINUTES_PER_DAY
} from "../server-game-constants/server-game-constants.js";
import { multiplierPercentLabel, percentLabel, type ModifierContext, type ModifierStructureType, type StructureModifier } from "./structure-modifier-catalog-types.js";

const manufactoryModifiers = (ctx: ModifierContext): StructureModifier[] => {
  const count = ctx.tile?.town?.manufactoryCount;
  const clearingHouseActive = Boolean(ctx.tile?.town?.clearingHouseActive);
  const perCopyPercent = (MANUFACTORY_GOLD_PRODUCTION_BONUS + (clearingHouseActive ? (MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE - MANUFACTORY_GOLD_PRODUCTION_BONUS) * (ctx.tile?.town?.clearingHouseUpliftMult ?? 1) : 0)) * 100;
  const goldPerDay = Math.round(MANUFACTORY_FLAT_GOLD_BONUS_PER_MIN * UPKEEP_MINUTES_PER_DAY);
  const hasLiveCount = typeof count === "number" && count > 0;
  const stackedValueText = hasLiveCount
    ? `${percentLabel(perCopyPercent * count)} town coin production`
    : `${percentLabel(perCopyPercent)} town coin production per Manufactory`;
  return [
    { statLabel: "Instant coin", valueText: `+${MANUFACTORY_INSTANT_GOLD_BONUS} (once, on completion)`, tone: "positive", isTownWide: true },
    { statLabel: "Coin", valueText: `+${goldPerDay}/day`, tone: "positive", isTownWide: true, rawValue: goldPerDay },
    // Nonlinear stacking (each copy is worth more with an active Clearing
    // House) means the aggregate total can't be derived by multiplying a
    // flat per-copy rawValue by count like the other town-wide modifiers —
    // it's already computed above from the live count, so rawValue carries
    // the final total percent directly (alreadyAggregated: true tells the
    // town-summary aggregator not to multiply it again).
    {
      statLabel: "Coin production",
      valueText: stackedValueText,
      tone: "positive",
      isTownWide: true,
      ...(hasLiveCount ? { rawValue: perCopyPercent * count, unit: "percent" as const, alreadyAggregated: true } : {})
    }
  ];
};

// Refineries (refineries/, territory-development-plan.md Phase 2): each
// processes one linked deposit field; boosters add to every processed tile of
// their resource in the same town.
const refineryModifiers = (type: string): StructureModifier[] => {
  if (isRefineryType(type)) {
    return [
      { statLabel: "Slots per garrisoned field tile", valueText: `+${REFINERY_SLOTS_PER_TILE}`, tone: "positive", isTownWide: false },
      { statLabel: "Field reach (land tiles from the town)", valueText: `${REFINERY_REACH_LAND_TILES}`, tone: "positive", isTownWide: false }
    ];
  }
  if (isRefineryBoosterType(type)) {
    return [{ statLabel: "Slots per processed field tile (town refineries)", valueText: `+${REFINERY_BOOSTER_SLOTS_PER_TILE}`, tone: "positive", isTownWide: true }];
  }
  return [];
};

// The *_PER_DAY constants below describe a daily production rate that the
// resource-slot rewrite (§5) retired — converterOutputPerMinute
// (player-update-economy.ts) returns {} for SYNTHESIZE mode, so no daily
// resource output is ever actually produced. The real live Refine-mode
// effect is a flat +1 slot supply of the family resource
// (isSlotSourceConverter, resource-slot-view.ts) -- only while actually in
// SYNTHESIZE mode. In EXCHANGE (Sell Off) mode the structure sells off that
// slot for real gold instead (isSlotSinkConverter, EXCHANGE_GOLD_PER_SLOT_PER_DAY
// via player-update-economy.ts) — surface that payout here as its own
// modifier line rather than silently dropping the entry: the tile-detail
// status line names the *behavior* ("selling off its slot and paying out
// gold") but never the amount, so this was the only place a player could
// see the actual gold/day figure for Sell Off mode.
const synthesizerModifiers = (type: ModifierStructureType, ctx: ModifierContext): StructureModifier[] | undefined => {
  const byType: Partial<Record<ModifierStructureType, string>> = {
    UMBRITE_WORKS: "UMBRITE",
    HIGH_YIELD_UMBRITE_WORKS: "UMBRITE",
    TITANIUM_WORKS: "TITANIUM",
    HIGH_YIELD_TITANIUM_WORKS: "TITANIUM",
    AETHER_CONDENSER: "CRYSTAL",
    HIGH_YIELD_AETHER_CONDENSER: "CRYSTAL"
  };
  const resource = byType[type];
  if (!resource) return undefined;
  if (ctx.tile?.converterMode === "EXCHANGE") {
    const goldPerDay = EXCHANGE_GOLD_PER_SLOT_PER_DAY[type as keyof typeof EXCHANGE_GOLD_PER_SLOT_PER_DAY] ?? 0;
    // rawValue (flat per-instance gold/day) lets townModifierTotalsFromCounts
    // aggregate this into the town-wide modifier list when the structure is
    // in a town's support ring (its gold is folded into that town's own
    // production there, same as Manufactory) — see TOWN_MODIFIER_AGGREGATE_TYPES.
    return [{ statLabel: "Sell Off coin", valueText: `+${goldPerDay}/day`, tone: "positive", isTownWide: true, rawValue: goldPerDay }];
  }
  return [{ statLabel: "Refine mode supplies", valueText: `+1 ${resource} slot`, tone: "positive", isTownWide: false }];
};

export const economicStructureModifiers = (type: ModifierStructureType, ctx: ModifierContext): StructureModifier[] | undefined => {
  // "+50% farm food" was retired by the resource-slot rewrite (§5) —
  // strategicProductionPerMinuteForResource (player-update-economy.ts) always
  // returns 0. Hydrogarden's only live effect is the FOOD slot below.
  if (type === "HYDROGARDEN") {
    return [
      { statLabel: "FOOD slot", valueText: `+${TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN}`, tone: "positive", isTownWide: false }
    ];
  }
  // "+100% Hydrogarden food" was retired by the resource-slot rewrite (§5) —
  // same dead-production class as Hydrogarden's own claim above. Hydroworks's
  // only live effect is the radius FOOD-slot bonus below (resource-slot-view.ts).
  if (type === "HYDROWORKS") {
    return [
      { statLabel: "FOOD slots per boosted Hydrogarden", valueText: `+${HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS}`, tone: "positive", isTownWide: false }
    ];
  }
  if (isRefineryType(type) || isRefineryBoosterType(type)) return refineryModifiers(type);
  if (type === "MANUFACTORY") return manufactoryModifiers(ctx);
  if (type === "INCUBATION_ENGINE") {
    return [
      { statLabel: "Population", valueText: `+${INCUBATION_ENGINE_INSTANT_POPULATION_BURST.toLocaleString()} (once, on completion)`, tone: "positive", isTownWide: true },
      { statLabel: "Population growth", valueText: multiplierPercentLabel(INCUBATION_ENGINE_ONGOING_GROWTH_MULT), tone: "positive", isTownWide: true }
    ];
  }
  if (type === "CENSUS_HALL") {
    return [
      { statLabel: "Population per connected Incubation Engine", valueText: `+${CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_INCUBATION_ENGINE.toLocaleString()}`, tone: "positive", isTownWide: true },
      { statLabel: "Town-tier upgrade cost", valueText: percentLabel(-(1 - CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT) * 100), tone: "positive", isTownWide: true }
    ];
  }
  if (type === "CLEARING_HOUSE") {
    // "+25%" alone read as +25% of gold production, when it's really a jump
    // from +10% to +35% gold bonus per Manufactory copy — spell out both ends
    // so the size of the buff is unambiguous.
    return [{
      statLabel: "Manufactory coin bonus per copy",
      valueText: `${percentLabel(MANUFACTORY_GOLD_PRODUCTION_BONUS * 100)} → ${percentLabel(MANUFACTORY_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE * 100)}`,
      tone: "positive",
      isTownWide: true
    }];
  }
  // The real connected-town bonus (connectedTownBonusForPlayer, economy-network.ts)
  // is a stepped ladder — +50%/+40%/+30% for the 1st/2nd/3rd connected town,
  // summed additively, capped at 3 towns — not a flat percentage. Trade Nexus
  // is the network's gate for this bonus (networkHasTradeNexus), not its
  // source, so no single per-copy number applies here.
  if (type === "TRADE_NEXUS") return [{ statLabel: "Connected-town coin bonus", valueText: "+50% / +40% / +30% (1st–3rd connected town)", tone: "positive", isTownWide: true }];
  if (type === "HARBOR_EXCHANGE") return [{ statLabel: "Coin / day per connected owned dock", valueText: "+5 coin/day", tone: "positive", isTownWide: true }];
  if (type === "MINISTRY_HALL") {
    return [
      { statLabel: `Nearby town FOOD slot demand (${MINISTRY_HALL_RADIUS}-tile radius)`, valueText: "-1 tier step", tone: "positive", isTownWide: true }
    ];
  }
  if (type === "ANCILLARY_DEPOT") {
    return [{ statLabel: "Manpower cap", valueText: `+${ANCILLARY_DEPOT_MANPOWER_CAP_BONUS}`, tone: "positive", isTownWide: true, rawValue: ANCILLARY_DEPOT_MANPOWER_CAP_BONUS }];
  }
  // Neural Works only amplifies Ancillary Factory manpower regen — the
  // tech-tree redesign moved manpower-cap network amplification to Assembly
  // Works exclusively (see runtime-manpower.ts's
  // playerManpowerCapFromSummary: reserveLatticeNetworkAncillaryDepotCount,
  // "Neural Works no longer touches it"). Don't add a manpower-cap line here.
  if (type === "NEURAL_WORKS") {
    return [{ statLabel: "Manpower per batch per Ancillary Factory in network", valueText: `+${manpowerPerBatch(NEURAL_WORKS_NETWORK_MANPOWER_REGEN_PER_ANCILLARY_FACTORY)}`, tone: "positive", isTownWide: true }];
  }
  if (type === "ANCILLARY_FACTORY") {
    return [{ statLabel: "Manpower per batch empire-wide", valueText: `+${manpowerPerBatch(ANCILLARY_FACTORY_STANDALONE_REGEN_PER_MINUTE)}`, tone: "positive", isTownWide: true, rawValue: manpowerPerBatch(ANCILLARY_FACTORY_STANDALONE_REGEN_PER_MINUTE) }];
  }
  if (type === "RESERVE_LATTICE") {
    return [{
      statLabel: "Ancillary Factory local capacity rate",
      valueText: "+150 cap +35% terrain-adjusted base capacity",
      tone: "positive",
      isTownWide: true
    }];
  }
  const synth = synthesizerModifiers(type, ctx);
  if (synth) return synth;
  return undefined;
};
