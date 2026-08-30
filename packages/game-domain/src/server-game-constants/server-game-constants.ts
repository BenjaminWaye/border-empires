import {
  OBSERVATORY_CAST_RADIUS as SHARED_OBSERVATORY_CAST_RADIUS,
  OBSERVATORY_PROTECTION_RADIUS as SHARED_OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS as SHARED_OBSERVATORY_VISION_BONUS,
  MANPOWER_BASE_CAP as SHARED_MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE as SHARED_MANPOWER_BASE_REGEN_PER_MINUTE,
  MANPOWER_REGEN_GLOBAL_FLOOR as SHARED_MANPOWER_REGEN_GLOBAL_FLOOR, STARTING_CAPITAL_MANPOWER_CAP as SHARED_STARTING_CAPITAL_MANPOWER_CAP, STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE as SHARED_STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE, EXPAND_MANPOWER_COST as SHARED_EXPAND_MANPOWER_COST, SETTLE_MANPOWER_COST as SHARED_SETTLE_MANPOWER_COST,
  GARRISON_HALL_MANPOWER_CAP_BONUS as SHARED_GARRISON_HALL_MANPOWER_CAP_BONUS,
  RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_GARRISON_HALL as SHARED_RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_GARRISON_HALL,
  RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL as SHARED_RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL,
  LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE as SHARED_LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE,
  RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD as SHARED_RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD,
  POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING as SHARED_POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING,
  QUARTERMASTERS_OFFICE_RADIUS as SHARED_QUARTERMASTERS_OFFICE_RADIUS,
  QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT as SHARED_QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT,
  GRANARY_INSTANT_POPULATION_BURST as SHARED_GRANARY_INSTANT_POPULATION_BURST,
  GRANARY_ONGOING_GROWTH_MULT as SHARED_GRANARY_ONGOING_GROWTH_MULT,
  CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY as SHARED_CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY,
  CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT as SHARED_CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT,
  TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO as SHARED_TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO,
  TITANIUM_LEVY_REGEN_FREEZE_MS as SHARED_TITANIUM_LEVY_REGEN_FREEZE_MS,
  TOWN_MANPOWER_BY_TIER as SHARED_TOWN_MANPOWER_BY_TIER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  manpowerRegenWeightForSettlementIndex as sharedManpowerRegenWeightForSettlementIndex,
  type PopulationTier,
  type TileKey
} from "@border-empires/shared";
import type { AbilityDefinition, VictoryPressureDefinition } from "../server-shared-types.js";

export const key = (x: number, y: number): TileKey => `${x},${y}`;
export const parseKey = (k: TileKey): [number, number] => {
  const [xs, ys] = k.split(",");
  return [Number(xs), Number(ys)];
};
export const BARBARIAN_OWNER_ID = "barbarian";
export const now = (): number => Date.now();
export const TRUCE_REQUEST_TTL_MS = 5 * 60_000;
export const TRUCE_BREAK_LOCKOUT_MS = 24 * 60 * 60_000;
export const PASSIVE_INCOME_MULT = 1.0;
export const GOLD_COST_EPSILON = 1e-6;
export const TILE_YIELD_CAP_GOLD = 24;
export const TILE_YIELD_CAP_RESOURCE = 6;
export const OFFLINE_YIELD_ACCUM_MAX_MS = 12 * 60 * 60 * 1000;
export const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
export const INITIAL_SHARD_SCATTER_COUNT = Math.max(28, Math.floor((WORLD_WIDTH * WORLD_HEIGHT) / 28_000));
export const SHARD_RAIN_SCHEDULE_HOURS = [12, 20] as const;
export const SHARD_RAIN_SITE_MIN = 3;
export const SHARD_RAIN_SITE_MAX = 6;
export const SHARD_RAIN_TTL_MS = 30 * 60_000;
// Gold rescope (docs/manpower-economy-rewrite-plan.md §6.1): every passive gold-income
// source below divides by this to preserve their relative balance while cutting the
// absolute magnitude — TOWN_BASE_GOLD_PER_MIN's old 2/min (~2,880/day/town) -> ~10/day.
export const GOLD_RESCALE_DIVISOR = 288;
export const STARTING_GOLD = 10;
export const MIN_ACTIVE_BARBARIAN_AGENTS = 80;
export const BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS = 6;
export const TOWN_BASE_GOLD_PER_MIN = 2 / GOLD_RESCALE_DIVISOR;
export const DOCK_INCOME_PER_MIN = 0.5 / GOLD_RESCALE_DIVISOR;
export const OBSERVATORY_VISION_BONUS = SHARED_OBSERVATORY_VISION_BONUS;
export const OBSERVATORY_PROTECTION_RADIUS = SHARED_OBSERVATORY_PROTECTION_RADIUS;
export const OBSERVATORY_CAST_RADIUS = SHARED_OBSERVATORY_CAST_RADIUS;
export const ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS = 10 * 60_000;
// §12.1/§5.1 (docs/manpower-economy-rewrite-plan.md): a structure's slot
// occupation IS its upkeep now — there is nothing left to meter per-minute
// on top of it. These GOLD_UPKEEP constants are pre-rewrite values that
// were never retired to 0 when their build cost moved to manpower + slots
// (unlike MINTWORKS_FOOD_UPKEEP/CARAVANARY_FOOD_UPKEEP below,
// which already got this treatment). Retired to 0 rather than deleted, same
// "leave plumbing, starve input" pattern.
export const FARMSTEAD_GOLD_UPKEEP = 0;
export const UMBRITE_RIG_GOLD_UPKEEP = 0;
export const MINE_GOLD_UPKEEP = 0;
export const GRANARY_GOLD_UPKEEP = 0;
export const SEED_GRANARY_SLOTS = 5;
export const SEED_GRANARY_GROWTH_MULT = 1.30;

/**
 * Pure town population-growth multiplier from Granary/Seed Granary — the
 * single shared source of truth for both the live-tick engine
 * (apps/simulation/src/runtime-population-growth.ts) and the display/
 * fallback snapshot paths (apps/simulation/src/live-town-summary.ts,
 * apps/realtime-gateway/src/tile-detail-snapshot/tile-detail-snapshot.ts,
 * apps/simulation/src/legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.ts).
 *
 * granary-bonus-unification task: commit 7a51b06b ("fix: Incubation Engine
 * double-dip") established, per explicit user decision at the time, that a
 * plain Granary should grant ONLY its instant one-time
 * GRANARY_INSTANT_POPULATION_BURST on completion — the pre-redesign flat
 * +15% ongoing growth multiplier was removed as a double-dip on top of that
 * burst. On 2026-08-26, per a new explicit user decision, that call was
 * reversed at a lower value: a plain Granary now also grants a flat
 * GRANARY_ONGOING_GROWTH_MULT (+10%) ongoing growth-rate multiplier for its
 * town, stacking with the burst. A Seed Granary's buffed-radius bonus
 * (SEED_GRANARY_GROWTH_MULT) stacks multiplicatively on top of that base
 * when the tile is covered by an active Seed Granary's 3x3 buff radius.
 */
export const granaryGrowthMultiplier = (hasAnyGranary: boolean, seedGranaryBuffed: boolean): number => {
  if (!hasAnyGranary) return 1;
  return seedGranaryBuffed ? GRANARY_ONGOING_GROWTH_MULT * SEED_GRANARY_GROWTH_MULT : GRANARY_ONGOING_GROWTH_MULT;
};
export const MANPOWER_EPSILON = 1e-6;
export const MANPOWER_BASE_CAP = SHARED_MANPOWER_BASE_CAP;
export const MANPOWER_BASE_REGEN_PER_MINUTE = SHARED_MANPOWER_BASE_REGEN_PER_MINUTE;
export const MANPOWER_REGEN_GLOBAL_FLOOR = SHARED_MANPOWER_REGEN_GLOBAL_FLOOR;
export const STARTING_CAPITAL_MANPOWER_CAP = SHARED_STARTING_CAPITAL_MANPOWER_CAP; export const STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE = SHARED_STARTING_CAPITAL_MANPOWER_REGEN_PER_MINUTE; export const EXPAND_MANPOWER_COST = SHARED_EXPAND_MANPOWER_COST; export const SETTLE_MANPOWER_COST = SHARED_SETTLE_MANPOWER_COST;
export const GARRISON_HALL_MANPOWER_CAP_BONUS = SHARED_GARRISON_HALL_MANPOWER_CAP_BONUS;
export const RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_GARRISON_HALL = SHARED_RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_GARRISON_HALL;
export const RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL = SHARED_RAIL_DEPOT_NETWORK_MANPOWER_CAP_PER_GARRISON_HALL;
export const LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE = SHARED_LOGISTICS_GUILD_STANDALONE_REGEN_PER_MINUTE;
export const RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD = SHARED_RAIL_DEPOT_NETWORK_MANPOWER_REGEN_PER_LOGISTICS_GUILD;
export const POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING = SHARED_POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING;
export const QUARTERMASTERS_OFFICE_RADIUS = SHARED_QUARTERMASTERS_OFFICE_RADIUS;
export const QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT = SHARED_QUARTERMASTERS_OFFICE_WAR_STRUCTURE_MANPOWER_COST_MULT;
export const GRANARY_INSTANT_POPULATION_BURST = SHARED_GRANARY_INSTANT_POPULATION_BURST;
export const GRANARY_ONGOING_GROWTH_MULT = SHARED_GRANARY_ONGOING_GROWTH_MULT;
export const CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY = SHARED_CENSUS_HALL_POPULATION_BONUS_PER_CONNECTED_GRANARY;
export const CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT = SHARED_CENSUS_HALL_TOWN_TIER_UPGRADE_GOLD_COST_MULT;
export const TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO = SHARED_TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO;
export const TITANIUM_LEVY_REGEN_FREEZE_MS = SHARED_TITANIUM_LEVY_REGEN_FREEZE_MS;
export const TOWN_MANPOWER_BY_TIER: Record<PopulationTier, { cap: number; regenPerMinute: number }> = SHARED_TOWN_MANPOWER_BY_TIER;
export const manpowerRegenWeightForSettlementIndex = sharedManpowerRegenWeightForSettlementIndex;
export const SETTLEMENT_BASE_GOLD_PER_MIN = 2 / GOLD_RESCALE_DIVISOR; // §24.6: 2x divisor (matches TOWN_BASE_GOLD_PER_MIN) — deliberate ~10 gold/day, not the old emergent ~5
// §6.4 (docs/manpower-economy-rewrite-plan.md): synthesizers are the ONE
// structure family gold still gates on an ongoing basis — everything else
// is upkeep-free (slot occupation only, see the GOLD_UPKEEP retirement
// comment above). Decided figures: 30 gold/day (Umbrite/Titanium), 40 gold/day
// (Crystal); Advanced tiers at 1.5x (45/45/60), enforcing "an upgraded
// building never costs less to run than the thing it upgrades." Expressed
// directly in gold/day per §6.4's implementation rule, converted through
// the single UPKEEP_MINUTES_PER_DAY divisor rather than each call site
// re-deriving its own "divide by N" — the exact bug class (Advanced Umbrite
// Synthesizer silently reusing UMBRITE_RIG_GOLD_UPKEEP) that rule exists to
// prevent.
export const UPKEEP_MINUTES_PER_DAY = 1440;
export const UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY = 30;
export const ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY = 45;
export const TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY = 30;
export const ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY = 45;
export const CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY = 40;
export const ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY = 60;

// Mintworks rebalance (structure-detail-screen task): an instant one-time gold
// grant on completion, plus a small flat gold/min bonus expressed so it sums
// to exactly its stated gold/day amount. Its main ongoing effect is a PER-
// MINTWORKS +10% town gold production bonus (+35% with an active Clearing
// House, preserving the existing +25pp Clearing House synergy gap), and
// STACKS ADDITIVELY across every active Mintworks in a town's support ring —
// e.g. 5 plain Mintworks = +50% (1.5x), not a flat capped 10%/35%.
//
// mintworks-stacking task: this used to be two independently-driftable
// MULTIPLIER constants (MINTWORKS_GOLD_PRODUCTION_MULT = 1.1 /
// MINTWORKS_GOLD_PRODUCTION_MULT_CLEARING_HOUSE = 1.35) paired with a boolean
// hasMintworks gate — every call site multiplied by one of those two constants
// directly, and several other call sites (live-town-summary.ts,
// tile-detail-snapshot.ts, legacy-snapshot-bootstrap.ts,
// legacy-snapshot-economy.ts) had independently hardcoded 1.5/1.75 instead of
// even referencing the constants, so the four formulas silently disagreed.
// Replaced with a single BONUS-per-mintworks source of truth plus the
// mintworksGoldProductionMultiplier() pure function below — every call site now
// computes a real mintworks COUNT (economy-network.ts's countSupportedStructures)
// and calls this one function, so the four formulas can no longer drift.
export const MINTWORKS_INSTANT_GOLD_BONUS = 10;
export const MINTWORKS_FLAT_GOLD_BONUS_PER_MIN = 1 / UPKEEP_MINUTES_PER_DAY;
export const MINTWORKS_GOLD_PRODUCTION_BONUS = 0.10;
export const MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE = 0.35;

/**
 * Pure per-mintworks gold production multiplier — the single shared source of
 * truth for both server (apps/simulation, apps/realtime-gateway) and client
 * (packages/client) call sites. Returns 1 (no bonus) when mintworksCount <= 0;
 * otherwise 1 + mintworksCount * (per-mintworks bonus, higher with an active
 * Clearing House). Deliberately takes a real count, not a boolean — each
 * Mintworks contributes its own bonus, stacking additively, not just "any
 * Mintworks present."
 */
export const mintworksGoldProductionMultiplier = (mintworksCount: number, clearingHouseActive: boolean): number => {
  if (mintworksCount <= 0) return 1;
  return 1 + mintworksCount * (clearingHouseActive ? MINTWORKS_GOLD_PRODUCTION_BONUS_CLEARING_HOUSE : MINTWORKS_GOLD_PRODUCTION_BONUS);
};

// Converter mode flip (docs/plans/2026-08-06-converter-mode-flip.md)
export const CONVERTER_MODE_FLIP_COOLDOWN_MS = 60 * 60_000;
// converter-mode-flip plan §Phase 4 (locked rates): flat gold/day per slot
// consumed by an EXCHANGE-mode converter. Advanced tiers pay 1.5x, mirroring
// "an upgraded building never costs less to run than the thing it upgrades."
// Basic: TITANIUM/UMBRITE 8, CRYSTAL 10. Advanced: TITANIUM/UMBRITE 12, CRYSTAL 15.
export const EXCHANGE_GOLD_PER_SLOT_PER_DAY = {
  UMBRITE_SYNTHESIZER: 8,
  ADVANCED_UMBRITE_SYNTHESIZER: 12,
  TITANIUM_WORKS: 8,
  ADVANCED_TITANIUM_WORKS: 12,
  CRYSTAL_SYNTHESIZER: 10,
  ADVANCED_CRYSTAL_SYNTHESIZER: 15
} as const;

/**
 * Pure per-instance EXCHANGE-mode converter gold production, in gold/minute —
 * single shared source of truth for both an EXCHANGE-mode converter's
 * standalone empire income (apps/simulation/player-update-economy.ts, when
 * the structure isn't in any town's support ring) and its town-support
 * attribution (when it IS in a town's support ring, this same per-instance
 * amount is folded into that town's own gold production instead, the same
 * way Mintworks contributes to town gold — see
 * apps/simulation/economy-network.ts's supportedConverterGoldPerMinuteForTown
 * and apps/simulation/live-town-summary.ts's wire-shaped counterpart).
 * Returns 0 for anything that isn't an active EXCHANGE-mode synthesizer.
 */
export const converterExchangeGoldPerMinute = (structureType: string, mode: string | undefined): number => {
  if (mode !== "EXCHANGE") return 0;
  const perDay = (EXCHANGE_GOLD_PER_SLOT_PER_DAY as Record<string, number | undefined>)[structureType];
  return perDay ? perDay / UPKEEP_MINUTES_PER_DAY : 0;
};
// §5 (resource slots, docs/manpower-economy-rewrite-plan.md): FOOD's only
// building-level cost is now the permanent slot it occupies
// (structure-slots.ts) — the separate per-minute flow drain these three
// constants used to charge on top of that would double-charge the same
// resource two different ways, so they're retired to 0 rather than deleted
// (their call sites — player-update-economy.ts, player-upkeep-incremental.ts —
// stay in place and naturally go inert, same "leave plumbing, starve input"
// treatment TITANIUM/CRYSTAL/UMBRITE got when their production was retired).
export const MINTWORKS_FOOD_UPKEEP = 0;
export const RELAY_BEACON_GOLD_UPKEEP = 0;
export const CARAVANARY_FOOD_UPKEEP = 0;
export const CUSTOMS_HOUSE_GOLD_UPKEEP = 0;
export const GARRISON_HALL_GOLD_UPKEEP = 0;
export const GOVERNORS_OFFICE_GOLD_UPKEEP = 0;
export const RADAR_SYSTEM_GOLD_UPKEEP = 0;
export const FOUNDRY_GOLD_UPKEEP = 0;
export const UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY = 18;
export const ADVANCED_UMBRITE_SYNTHESIZER_UMBRITE_PER_DAY = 21.6;
export const TITANIUM_WORKS_TITANIUM_PER_DAY = 18;
export const ADVANCED_TITANIUM_WORKS_TITANIUM_PER_DAY = 21.6;
export const CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY = 12;
export const ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY = 14.4;
// §12.1 (docs/manpower-economy-rewrite-plan.md): Airport's ongoing crystal
// drain is replaced entirely by its permanent CRYSTAL slot occupation —
// "the slot occupation itself is the upkeep... there is nothing left to
// meter per-minute." Retired to 0 rather than deleted (call sites across
// player-update-economy.ts/player-upkeep-incremental.ts/snapshot-economy-
// helpers.ts/tile-detail-snapshot.ts naturally go inert).
export const AIRPORT_CRYSTAL_UPKEEP_PER_MIN = 0;
export const AIRPORT_BOMBARD_GOLD_COST = 0;
export const AIRPORT_BOMBARD_RANGE = 30;
export const AIRPORT_BOMBARD_COOLDOWN_MS = 20 * 60_000;
export const AIRPORT_BOMBARD_BASE_MISS_CHANCE = 0.15;
export const AIRPORT_BOMBARD_FORT_MISS_BONUS = 0.25;
export const AIRPORT_BOMBARD_MAX_MISS_CHANCE = 0.80;
export const RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS = 30;
export const AETHER_TOWER_RADIUS = 30;
export const AIRPORT_BOMBARD_MIN_FIELD_TILES = 2;
export const AIRPORT_BOMBARD_MAX_FIELD_TILES = 4;
export const STRUCTURE_OUTPUT_MULT = 1.5;
export const FOUNDRY_RADIUS = 5;
export const FOUNDRY_OUTPUT_MULT = 2;
export const WATERWORKS_RADIUS = 10;
export const WATERWORKS_OUTPUT_MULT = 2;
export const GOVERNORS_OFFICE_RADIUS = 10;
export const RADAR_SYSTEM_RADIUS = 30;
export const IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS = 24 * 60 * 60_000; // §15/§17: free activation, takes 100% of chosen target's gold.
export const WORLD_ENGINE_STRIKE_GOLD_COST = 1_000;
export const WORLD_ENGINE_STRIKE_COOLDOWN_MS = 10 * 60_000;
export const WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO = 0.30;
export const AEGIS_DOME_PROTECTION_RADIUS = 25;
export const AEGIS_LOCK_COOLDOWN_MS = 60 * 60_000;
export const AEGIS_LOCK_DURATION_MS = 15 * 60_000;
// Cooldown matches the satellite's own uptime (below) — the launch handler
// additionally hard-blocks relaunching while a satellite is still aloft
// (see ASTRAL_DOCK_LAUNCH_ACTIVE_UNTIL_KEY), so this is belt-and-suspenders.
export const ASTRAL_DOCK_LAUNCH_COOLDOWN_MS = 24 * 60 * 60_000;
export const ASTRAL_DOCK_LAUNCH_DURATION_MS = 24 * 60 * 60_000;
export const ASTRAL_DOCK_LAUNCH_GOLD_COST = 1_000;
// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Manually activated,
// no cooldown between charges — a player can burn all 3 back-to-back.
export const IMPERIAL_WARD_DURATION_MS = 10 * 60_000;
export const IMPERIAL_WARD_CHARGES_GRANTED = 3;
export const REVEAL_EMPIRE_ACTIVATION_COST = 0; // §17: free
export const REVEAL_EMPIRE_UPKEEP_PER_MIN = 0; // §17: free, no ongoing upkeep either
export const SURVEY_SWEEP_CRYSTAL_COST = 0; // §17: free
export const SURVEY_SWEEP_COOLDOWN_MS = 12 * 60_000;
export const SURVEY_SWEEP_HALF_EXTENT = 25;
export const REVEAL_EMPIRE_STATS_CRYSTAL_COST = 0; // §17: free
export const REVEAL_EMPIRE_STATS_COOLDOWN_MS = 5 * 60_000;
export const AETHER_LANCE_CRYSTAL_COST = 0; // §17: free
export const AETHER_LANCE_COOLDOWN_MS = 10 * 60_000;
export const AETHER_BRIDGE_CRYSTAL_COST = 0; // §17: free
export const AETHER_BRIDGE_COOLDOWN_MS = 30 * 60_000;
export const AETHER_BRIDGE_DURATION_MS = 8 * 60_000;
export const AETHER_BRIDGE_MAX_SEA_TILES = 4;
export const AETHER_WALL_CRYSTAL_COST = 0; // §17: free
export const AETHER_WALL_COOLDOWN_MS = 8 * 60_000;
export const AETHER_WALL_DURATION_MS = 20 * 60_000;
export const SIPHON_CRYSTAL_COST = 0; // §17: free
export const SIPHON_COOLDOWN_MS = 10 * 60_000;
export const SIPHON_DURATION_MS = 60 * 60_000;
export const SIPHON_SHARE = 1;
export const TERRAIN_SHAPING_GOLD_COST = 8000;
export const TERRAIN_SHAPING_CRYSTAL_COST = 0; // §17: free (gold cost is separate and unchanged)
export const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;
export const PLAYER_MOUNTAIN_DENSITY_RADIUS = 5;
export const PLAYER_MOUNTAIN_DENSITY_LIMIT = 3;
export const POPULATION_GROWTH_BASE_RATE = 0.00032;
/** Settlements start with a much smaller population than a Town (800 vs 10k+), so their growth
 * rate is boosted to reach the Town-tier threshold (10,000 population) in a comparable timeframe. */
export const SETTLEMENT_GROWTH_RATE_MULT = 4;
// §5.3/§5.4: a town's FOOD requirement is TOWN_FOOD_SLOT_DEMAND slots
// (structure-slots.ts), gated by dormancy (Runtime.isTownFoodDormant) — not a
// per-minute stockpile drain anymore. Retired to always-0 rather than
// deleted; several display/aggregation call sites (live-town-summary.ts,
// player-upkeep-incremental.ts, the legacy/reconnect snapshot paths) still
// read it for a "food upkeep per minute" figure that's now always 0, same
// "leave plumbing, starve input" treatment as MINTWORKS_FOOD_UPKEEP above.
export const townFoodUpkeepPerMinute = (_populationTier: string | undefined): number => 0;

/**
 * Pure town gold/growth population-tier multiplier — the single shared
 * source of truth for every call site that scales a per-town formula by
 * population tier (TOWN_BASE_GOLD_PER_MIN, gold cap, etc).
 *
 * building-bonus-unification task: this table used to be re-implemented
 * independently in SIX places — apps/simulation/src/player-update-economy/
 * player-update-economy.ts, apps/simulation/src/snapshot-economy-helpers.ts,
 * apps/realtime-gateway/src/tile-detail-snapshot/tile-detail-snapshot.ts
 * (as townPopulationMultiplierLocal), apps/simulation/src/
 * legacy-snapshot-bootstrap/legacy-snapshot-bootstrap.ts,
 * apps/simulation/src/legacy-snapshot-economy/legacy-snapshot-economy.ts,
 * and packages/client/src/client-town-capture/client-town-capture.ts — with
 * every reachable tier (TOWN/CITY/GREAT_CITY/METROPOLIS) agreeing, EXCEPT
 * that two of the six (snapshot-economy-helpers.ts,
 * legacy-snapshot-bootstrap.ts, legacy-snapshot-economy.ts) special-cased
 * SETTLEMENT to 0.6 while the others fell through to the shared default of
 * 1. This is confirmed dead-code drift, not a live disagreement: every call
 * site gates SETTLEMENT-tier towns to a separate SETTLEMENT_BASE_GOLD_PER_MIN
 * branch before this multiplier is ever reached (see townGoldPerMinuteForPlayer,
 * fallbackTownGoldPerMinute, the legacy tier===\"SETTLEMENT\" ternaries, and
 * client-town-capture.ts's isSettlement branch) — the 0.6 case has never
 * actually executed. Unified on the reachable-tier value (default 1) rather
 * than the unreachable 0.6, since 1 is what every majority/authoritative
 * call site already used.
 */
export const townPopulationMultiplier = (populationTier: string | undefined): number => {
  switch (populationTier) {
    case "CITY": return 1.5;
    case "GREAT_CITY": return 2.5;
    case "METROPOLIS": return 3.2;
    default: return 1;
  }
};

export const POPULATION_MAX = 10_000_000;
export const POPULATION_TOWN_MIN = 10_000;
export const WORLD_TOWN_POPULATION_MIN = 15_000;
export const WORLD_TOWN_POPULATION_START_SPREAD = 10_000;
export const NEARBY_WAR_RADIUS = 10;
export const NEARBY_WAR_PAUSE_MS = 60 * 60_000;
export const LONG_PEACE_MS = 24 * 60 * 60_000;
export const LONG_PEACE_GROWTH_MULT = 1.20;
export const LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD = 250;
export const BREACH_SHOCK_MS = 180_000;
export const SEASON_VICTORY_HOLD_MS = 24 * 60 * 60_000;
export const SEASON_VICTORY_TOWN_CONTROL_SHARE = 0.5;
// 1000 gold per day converted to per-minute for internal comparison.
export const SEASON_VICTORY_ECONOMY_MIN_INCOME = 1000 / 1440;
export const SEASON_VICTORY_ECONOMY_LEAD_MULT = 1.33;
export const SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE = 0.8;
export const SEASON_VICTORY_MARITIME_DOCK_SHARE = 0.55;
export const SEASON_VICTORY_MARITIME_MIN_DOCKS = 3;
export const SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE = 0.66;

// Galactic meta-layer v0 tiering (docs/galactic-campaign-design.md §3, §13).
// §13 does not pin these two cutoffs — its Stipend formula is playtested-as-
// internally-consistent, not these thresholds — so treat them as a starting
// point, not a settled balance number.
//
// A non-winning competitive player who leads a DIFFERENT victory path than
// the one that won, with that path's progress at or above this fraction,
// gets an Outpost (§3 "came within a threshold of winning").
export const GALAXY_OUTPOST_PROGRESS_THRESHOLD = 0.5;
// Any player whose own best-path progress fraction is strictly above this
// floor (and who didn't qualify for an Outpost) gets a Stipend; a player at
// exactly 0 (never engaged with any objective) gets no galactic record.
export const GALAXY_STIPEND_MIN_PROGRESS = 0;
// Stipend payout formula (§13): (10 × progress) Inf + (40 × progress) Prod.
export const GALAXY_STIPEND_INFLUENCE_PER_PROGRESS = 10;
export const GALAXY_STIPEND_PRODUCTION_PER_PROGRESS = 40;
export const VICTORY_PRESSURE_DEFS: VictoryPressureDefinition[] = [
  {
    id: "TOWN_CONTROL",
    name: "Town Control",
    description: "Control 50% of all towns in the world.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "ECONOMIC_HEGEMONY",
    name: "Economic Ascendancy",
    description: "Lead the world economy by 33% while producing at least 1000 gold per day.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "RESOURCE_MONOPOLY",
    name: "Resource Monopoly",
    description: "Control at least 80% of all tiles of one world resource type.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "MARITIME_SUPREMACY",
    name: "Maritime Supremacy",
    description: "Control 55% of the world's docks.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "DIPLOMATIC_DOMINANCE",
    name: "Diplomatic Dominance",
    description: "Your alliance controls 66% of claimable land, and you are the largest empire in that alliance.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  }
];
export const ABILITY_DEFS: Record<AbilityDefinition["id"], AbilityDefinition> = {
  reveal_empire: {
    id: "reveal_empire",
    name: "Reveal Empire",
    requiredTechIds: ["cryptography"],
    crystalCost: REVEAL_EMPIRE_ACTIVATION_COST,
    cooldownMs: 0,
    upkeepCrystalPerMinute: REVEAL_EMPIRE_UPKEEP_PER_MIN
  },
  reveal_empire_stats: {
    id: "reveal_empire_stats",
    name: "Reveal Empire Stats",
    requiredTechIds: ["surveying"],
    crystalCost: REVEAL_EMPIRE_STATS_CRYSTAL_COST,
    cooldownMs: REVEAL_EMPIRE_STATS_COOLDOWN_MS
  },
  survey_sweep: {
    id: "survey_sweep",
    name: "Survey Sweep",
    requiredTechIds: ["surveying"],
    crystalCost: SURVEY_SWEEP_CRYSTAL_COST,
    cooldownMs: SURVEY_SWEEP_COOLDOWN_MS
  },
  aether_lance: {
    id: "aether_lance",
    name: "Aether Purge",
    requiredTechIds: ["signal-fires"],
    crystalCost: AETHER_LANCE_CRYSTAL_COST,
    cooldownMs: AETHER_LANCE_COOLDOWN_MS
  },
  aether_bridge: {
    id: "aether_bridge",
    name: "Aether Bridge",
    requiredTechIds: ["navigation"],
    crystalCost: AETHER_BRIDGE_CRYSTAL_COST,
    cooldownMs: AETHER_BRIDGE_COOLDOWN_MS,
    durationMs: AETHER_BRIDGE_DURATION_MS
  },
  aether_wall: {
    id: "aether_wall",
    name: "Aether Wall",
    requiredTechIds: ["harborcraft"],
    crystalCost: AETHER_WALL_CRYSTAL_COST,
    cooldownMs: AETHER_WALL_COOLDOWN_MS,
    durationMs: AETHER_WALL_DURATION_MS
  },
  siphon: {
    id: "siphon",
    name: "Siphon",
    requiredTechIds: ["logistics"],
    crystalCost: SIPHON_CRYSTAL_COST,
    cooldownMs: SIPHON_COOLDOWN_MS,
    durationMs: SIPHON_DURATION_MS
  },
  create_mountain: {
    id: "create_mountain",
    name: "Create Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  },
  remove_mountain: {
    id: "remove_mountain",
    name: "Remove Mountain",
    requiredTechIds: ["terrain-engineering"],
    crystalCost: TERRAIN_SHAPING_CRYSTAL_COST,
    cooldownMs: TERRAIN_SHAPING_COOLDOWN_MS
  }
};
