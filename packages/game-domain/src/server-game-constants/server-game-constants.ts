import {
  OBSERVATORY_CAST_RADIUS as SHARED_OBSERVATORY_CAST_RADIUS,
  OBSERVATORY_PROTECTION_RADIUS as SHARED_OBSERVATORY_PROTECTION_RADIUS,
  OBSERVATORY_VISION_BONUS as SHARED_OBSERVATORY_VISION_BONUS,
  MANPOWER_BASE_CAP as SHARED_MANPOWER_BASE_CAP,
  MANPOWER_BASE_REGEN_PER_MINUTE as SHARED_MANPOWER_BASE_REGEN_PER_MINUTE,
  RAIL_DEPOT_MANPOWER_REGEN_PER_MIN as SHARED_RAIL_DEPOT_MANPOWER_REGEN_PER_MIN,
  TOWN_MANPOWER_BY_TIER as SHARED_TOWN_MANPOWER_BY_TIER,
  WORLD_HEIGHT,
  WORLD_WIDTH,
  manpowerRegenWeightForSettlementIndex as sharedManpowerRegenWeightForSettlementIndex,
  structureBaseGoldCost,
  type PopulationTier,
  type TileKey
} from "@border-empires/shared";
import type { AbilityDefinition, MissionDef, StrategicResource, VictoryPressureDefinition } from "../server-shared-types.js";

export const key = (x: number, y: number): TileKey => `${x},${y}`;
export const parseKey = (k: TileKey): [number, number] => {
  const [xs, ys] = k.split(",");
  return [Number(xs), Number(ys)];
};
export const BARBARIAN_OWNER_ID = "barbarian";
export const BARBARIAN_TICK_MS = 5_000;
export const playerPairKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
export const now = (): number => Date.now();
export const TRUCE_REQUEST_TTL_MS = 5 * 60_000;
export const TRUCE_BREAK_LOCKOUT_MS = 24 * 60 * 60_000;
export const TRUCE_BREAK_ATTACK_MULT = 0.75;
export const TRUCE_BREAK_ATTACK_PENALTY_MS = 60 * 60_000;
export const PASSIVE_INCOME_MULT = 1.0;
export const FRONTIER_ACTION_GOLD_COST = 1;
export const GOLD_COST_EPSILON = 1e-6;
export const canAffordGoldCost = (gold: number, cost: number): boolean => gold + GOLD_COST_EPSILON >= cost;
export const HARVEST_GOLD_RATE_MULT = 1;
export const HARVEST_RESOURCE_RATE_MULT = 1 / 1440;
export const TILE_YIELD_CAP_GOLD = 24;
export const TILE_YIELD_CAP_RESOURCE = 6;
export const OFFLINE_YIELD_ACCUM_MAX_MS = 12 * 60 * 60 * 1000;
export const COLLECT_VISIBLE_COOLDOWN_MS = 20_000;
export const IDLE_SNAPSHOT_INTERVAL_MS = 5 * 60_000;
export const INITIAL_SHARD_SCATTER_COUNT = Math.max(28, Math.floor((WORLD_WIDTH * WORLD_HEIGHT) / 28_000));
export const SHARD_RAIN_SCHEDULE_HOURS = [12, 20] as const;
export const SHARD_RAIN_SITE_MIN = 3;
export const SHARD_RAIN_SITE_MAX = 6;
export const SHARD_RAIN_TTL_MS = 30 * 60_000;
export const FIRST_SPECIAL_SITE_CAPTURE_GOLD = 6;
export const STARTING_GOLD = 100;
export const MIN_ACTIVE_BARBARIAN_AGENTS = 80;
export const BARBARIAN_MAINTENANCE_INTERVAL_MS = 10_000;
export const BARBARIAN_MAINTENANCE_MAX_SPAWNS_PER_PASS = 6;
export const PVP_REWARD_MULT = 0.55;
export const TOWN_BASE_GOLD_PER_MIN = 2;
export const DOCK_INCOME_PER_MIN = 0.5;
export const FORT_BUILD_IRON_COST = 45;
export const SIEGE_OUTPOST_BUILD_SUPPLY_COST = 45;
export const SYNTH_OVERLOAD_GOLD_COST = 12_500;
export const SYNTH_OVERLOAD_DISABLE_MS = 24 * 60 * 60_000;
export const FUR_SYNTHESIZER_OVERLOAD_SUPPLY = 15;
export const IRONWORKS_OVERLOAD_IRON = 15;
export const CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL = 10;
export const OBSERVATORY_VISION_BONUS = SHARED_OBSERVATORY_VISION_BONUS;
export const OBSERVATORY_PROTECTION_RADIUS = SHARED_OBSERVATORY_PROTECTION_RADIUS;
export const OBSERVATORY_CAST_RADIUS = SHARED_OBSERVATORY_CAST_RADIUS;
export const ECONOMIC_STRUCTURE_UPKEEP_INTERVAL_MS = 10 * 60_000;
export const FARMSTEAD_BUILD_GOLD_COST = structureBaseGoldCost("FARMSTEAD");
export const FARMSTEAD_BUILD_FOOD_COST = 20;
export const FARMSTEAD_GOLD_UPKEEP = 1;
export const CAMP_BUILD_GOLD_COST = structureBaseGoldCost("CAMP");
export const CAMP_BUILD_SUPPLY_COST = 30;
export const CAMP_GOLD_UPKEEP = 1.2;
export const MINE_BUILD_GOLD_COST = structureBaseGoldCost("MINE");
export const MINE_BUILD_RESOURCE_COST = 30;
export const MINE_GOLD_UPKEEP = 1.2;
export const MARKET_BUILD_GOLD_COST = structureBaseGoldCost("MARKET");
export const GRANARY_BUILD_GOLD_COST = structureBaseGoldCost("GRANARY");
export const GRANARY_BUILD_FOOD_COST = 40;
export const GRANARY_GOLD_UPKEEP = 1;
export const SEED_GRANARY_BUILD_GOLD_COST = structureBaseGoldCost("SEED_GRANARY");
export const SEED_GRANARY_BUILD_FOOD_COST = 80;
export const SEED_GRANARY_GOLD_UPKEEP = 2;
export const SEED_GRANARY_SLOTS = 5;
export const SEED_GRANARY_GROWTH_MULT = 1.30;
export const BANK_BUILD_GOLD_COST = structureBaseGoldCost("BANK");
export const AIRPORT_BUILD_GOLD_COST = structureBaseGoldCost("AIRPORT");
export const AIRPORT_BUILD_CRYSTAL_COST = 80;
export const FUR_SYNTHESIZER_BUILD_GOLD_COST = structureBaseGoldCost("FUR_SYNTHESIZER");
export const IRONWORKS_BUILD_GOLD_COST = structureBaseGoldCost("IRONWORKS");
export const CRYSTAL_SYNTHESIZER_BUILD_GOLD_COST = structureBaseGoldCost("CRYSTAL_SYNTHESIZER");
export const CARAVANARY_BUILD_GOLD_COST = structureBaseGoldCost("CARAVANARY");
export const CUSTOMS_HOUSE_BUILD_GOLD_COST = structureBaseGoldCost("CUSTOMS_HOUSE");
export const CUSTOMS_HOUSE_BUILD_CRYSTAL_COST = 60;
export const GARRISON_HALL_BUILD_GOLD_COST = structureBaseGoldCost("GARRISON_HALL");
export const GARRISON_HALL_BUILD_CRYSTAL_COST = 80;
export const GOVERNORS_OFFICE_BUILD_GOLD_COST = structureBaseGoldCost("GOVERNORS_OFFICE");
export const RADAR_SYSTEM_BUILD_GOLD_COST = structureBaseGoldCost("RADAR_SYSTEM");
export const RADAR_SYSTEM_BUILD_CRYSTAL_COST = 120;
export const FOUNDRY_BUILD_GOLD_COST = structureBaseGoldCost("FOUNDRY");
export const MANPOWER_EPSILON = 1e-6;
export const MANPOWER_BASE_CAP = SHARED_MANPOWER_BASE_CAP;
export const MANPOWER_BASE_REGEN_PER_MINUTE = SHARED_MANPOWER_BASE_REGEN_PER_MINUTE;
export const RAIL_DEPOT_MANPOWER_REGEN_PER_MIN = SHARED_RAIL_DEPOT_MANPOWER_REGEN_PER_MIN;
export const TOWN_MANPOWER_BY_TIER: Record<PopulationTier, { cap: number; regenPerMinute: number }> = SHARED_TOWN_MANPOWER_BY_TIER;
export const manpowerRegenWeightForSettlementIndex = sharedManpowerRegenWeightForSettlementIndex;
export const SETTLEMENT_BASE_GOLD_PER_MIN = 1;
export const FUR_SYNTHESIZER_GOLD_UPKEEP = 60;
export const IRONWORKS_GOLD_UPKEEP = 60;
export const CRYSTAL_SYNTHESIZER_GOLD_UPKEEP = 80;
export const MARKET_FOOD_UPKEEP = 0.5;
export const WOODEN_FORT_GOLD_UPKEEP = 0.5;
export const LIGHT_OUTPOST_GOLD_UPKEEP = 0.5;
export const BANK_FOOD_UPKEEP = 1;
export const CARAVANARY_FOOD_UPKEEP = 0.75;
export const CUSTOMS_HOUSE_GOLD_UPKEEP = 15;
export const GARRISON_HALL_GOLD_UPKEEP = 25;
export const GOVERNORS_OFFICE_GOLD_UPKEEP = 30;
export const RADAR_SYSTEM_GOLD_UPKEEP = 45;
export const FOUNDRY_GOLD_UPKEEP = 50;
export const FUR_SYNTHESIZER_SUPPLY_PER_DAY = 18;
export const ADVANCED_FUR_SYNTHESIZER_SUPPLY_PER_DAY = 21.6;
export const IRONWORKS_IRON_PER_DAY = 18;
export const ADVANCED_IRONWORKS_IRON_PER_DAY = 21.6;
export const CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY = 12;
export const ADVANCED_CRYSTAL_SYNTHESIZER_CRYSTAL_PER_DAY = 14.4;
export const AIRPORT_CRYSTAL_UPKEEP_PER_MIN = 0.025;
export const AIRPORT_BOMBARD_CRYSTAL_COST = 200;
export const AIRPORT_BOMBARD_GOLD_COST = 5_000;
export const AIRPORT_BOMBARD_RANGE = 30;
export const AIRPORT_BOMBARD_COOLDOWN_MS = 20 * 60_000;
export const AIRPORT_BOMBARD_BASE_MISS_CHANCE = 0.15;
export const AIRPORT_BOMBARD_FORT_MISS_BONUS = 0.25;
export const AIRPORT_BOMBARD_MAX_MISS_CHANCE = 0.80;
export const RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS = 30;
export const AETHER_TOWER_RADIUS = 30;
export const AIRPORT_BOMBARD_ATTACK_MULT = 0.95;
export const AIRPORT_BOMBARD_MIN_FIELD_TILES = 2;
export const AIRPORT_BOMBARD_MAX_FIELD_TILES = 4;
export const STRUCTURE_OUTPUT_MULT = 1.5;
export const FOUNDRY_RADIUS = 5;
export const FOUNDRY_OUTPUT_MULT = 2;
export const WATERWORKS_RADIUS = 10;
export const WATERWORKS_OUTPUT_MULT = 1.5;
export const GOVERNORS_OFFICE_RADIUS = 10;
export const GOVERNORS_OFFICE_UPKEEP_MULT = 0.8;
export const RADAR_SYSTEM_RADIUS = 30;
export const IMPERIAL_EXCHANGE_LEVY_CRYSTAL_COST = 200;
export const IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS = 30 * 60_000;
export const IMPERIAL_EXCHANGE_LEVY_SHARE = 0.25;
export const WORLD_ENGINE_STRIKE_CRYSTAL_COST = 500;
export const WORLD_ENGINE_STRIKE_GOLD_COST = 15_000;
export const WORLD_ENGINE_STRIKE_COOLDOWN_MS = 60 * 60_000;
export const WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO = 0.30;
export const AEGIS_DOME_PROTECTION_RADIUS = 30;
export const AEGIS_LOCK_CRYSTAL_COST = 220;
export const AEGIS_LOCK_COOLDOWN_MS = 60 * 60_000;
export const AEGIS_LOCK_DURATION_MS = 15 * 60_000;
export const ASTRAL_DOCK_LAUNCH_CRYSTAL_COST = 300;
export const ASTRAL_DOCK_LAUNCH_COOLDOWN_MS = 90 * 60_000;
export const ASTRAL_DOCK_LAUNCH_DURATION_MS = 24 * 60 * 60_000;
// Emperor-endorsement bonus (galaxy meta-layer Phase 1). Manually activated,
// no cooldown between charges — a player can burn all 3 back-to-back.
export const IMPERIAL_WARD_DURATION_MS = 10 * 60_000;
export const IMPERIAL_WARD_CHARGES_GRANTED = 3;
export const REVEAL_EMPIRE_ACTIVATION_COST = 20;
export const REVEAL_EMPIRE_UPKEEP_PER_MIN = 0.015;
export const SURVEY_SWEEP_CRYSTAL_COST = 30;
export const SURVEY_SWEEP_COOLDOWN_MS = 12 * 60_000;
export const SURVEY_SWEEP_HALF_EXTENT = 25;
export const REVEAL_EMPIRE_STATS_CRYSTAL_COST = 15;
export const REVEAL_EMPIRE_STATS_COOLDOWN_MS = 5 * 60_000;
export const AETHER_LANCE_GOLD_COST = 3_000;
export const AETHER_LANCE_CRYSTAL_COST = 100;
export const AETHER_LANCE_COOLDOWN_MS = 10 * 60_000;
export const DEEP_STRIKE_CRYSTAL_COST = 25;
export const DEEP_STRIKE_COOLDOWN_MS = 20 * 60_000;
export const DEEP_STRIKE_ATTACK_MULT = 0.9;
export const DEEP_STRIKE_MAX_DISTANCE = 2;
export const NAVAL_INFILTRATION_CRYSTAL_COST = 30;
export const NAVAL_INFILTRATION_COOLDOWN_MS = 30 * 60_000;
export const NAVAL_INFILTRATION_ATTACK_MULT = 0.85;
export const NAVAL_INFILTRATION_MAX_RANGE = 5;
export const SABOTAGE_CRYSTAL_COST = 20;
export const SABOTAGE_COOLDOWN_MS = 15 * 60_000;
export const SABOTAGE_DURATION_MS = 45 * 60_000;
export const SABOTAGE_OUTPUT_MULT = 0.5;
export const AETHER_BRIDGE_CRYSTAL_COST = 30;
export const AETHER_BRIDGE_COOLDOWN_MS = 30 * 60_000;
export const AETHER_BRIDGE_DURATION_MS = 8 * 60_000;
export const AETHER_BRIDGE_MAX_SEA_TILES = 4;
export const AETHER_WALL_CRYSTAL_COST = 25;
export const AETHER_WALL_COOLDOWN_MS = 8 * 60_000;
export const AETHER_WALL_DURATION_MS = 20 * 60_000;
export const SIPHON_CRYSTAL_COST = 15;
export const SIPHON_COOLDOWN_MS = 10 * 60_000;
export const SIPHON_DURATION_MS = 60 * 60_000;
export const SIPHON_SHARE = 1;
export const TERRAIN_SHAPING_GOLD_COST = 8000;
export const TERRAIN_SHAPING_CRYSTAL_COST = 400;
export const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;
export const TERRAIN_SHAPING_RANGE = 2;
export const PLAYER_MOUNTAIN_DENSITY_RADIUS = 5;
export const PLAYER_MOUNTAIN_DENSITY_LIMIT = 3;
export const NEW_SETTLEMENT_DEFENSE_MS = 15 * 60_000;
export const POPULATION_GROWTH_BASE_RATE = 0.00032;
/** Settlements start with a much smaller population than a Town (800 vs 10k+), so their growth
 * rate is boosted to reach the Town-tier threshold (10,000 population) in a comparable timeframe. */
export const SETTLEMENT_GROWTH_RATE_MULT = 4;
export const townFoodUpkeepPerMinute = (populationTier: string | undefined): number => {
  if (populationTier === "SETTLEMENT" || !populationTier) return 0;
  if (populationTier === "CITY") return 0.3;
  if (populationTier === "GREAT_CITY") return 0.6;
  if (populationTier === "METROPOLIS") return 1;
  return 0.1;
};
export const POPULATION_MIN = 3_000;
export const POPULATION_MAX = 10_000_000;
export const POPULATION_START_SPREAD = 2_000;
export const POPULATION_TOWN_MIN = 10_000;
export const WORLD_TOWN_POPULATION_MIN = 15_000;
export const WORLD_TOWN_POPULATION_START_SPREAD = 10_000;
export const POPULATION_GROWTH_TICK_MS = 60_000;
/** Food cost to manually upgrade a town tier (lump sum). Tier thresholds: CITY=100k, GREAT_CITY=1M, METROPOLIS=5M pop. */
export const TIER_UPGRADE_FOOD_COST: Record<"CITY" | "GREAT_CITY" | "METROPOLIS", number> = {
  CITY: 500,
  GREAT_CITY: 2000,
  METROPOLIS: 8000
};
export const GROWTH_PAUSE_MS = 60 * 60_000;
export const GROWTH_PAUSE_MAX_MS = 6 * 60 * 60_000;
export const NEARBY_WAR_RADIUS = 10;
export const NEARBY_WAR_PAUSE_MS = 60 * 60_000;
export const LONG_PEACE_MS = 24 * 60 * 60_000;
export const LONG_PEACE_GROWTH_MULT = 1.20;
export const LARGE_ISLAND_MULTI_DOCK_TILE_THRESHOLD = 250;
export const BREACH_SHOCK_MS = 180_000;
export const BREACH_SHOCK_DEF_MULT = 0.72;
export const DYNAMIC_MISSION_MS = 7 * 24 * 60 * 60 * 1000;
export const VENDETTA_ATTACK_BUFF_MULT = 1.15;
export const VENDETTA_ATTACK_BUFF_MS = 24 * 60 * 60 * 1000;
export const RESOURCE_CHAIN_BUFF_MS = 24 * 60 * 60 * 1000;
export const RESOURCE_CHAIN_MULT = 1.4;
export const SEASON_VICTORY_HOLD_MS = 24 * 60 * 60_000;
export const SEASON_VICTORY_TOWN_CONTROL_SHARE = 0.5;
export const SEASON_VICTORY_ECONOMY_MIN_INCOME = 200;
export const SEASON_VICTORY_ECONOMY_LEAD_MULT = 1.33;
export const SEASON_VICTORY_RESOURCE_MONOPOLY_SHARE = 0.8;
export const SEASON_VICTORY_MARITIME_DOCK_SHARE = 0.55;
export const SEASON_VICTORY_MARITIME_MIN_DOCKS = 3;
export const SEASON_VICTORY_DIPLOMATIC_CONTROL_SHARE = 0.66;
export const VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS = 2 * 60 * 60_000;
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
    description: "Lead the world economy by 33% while producing at least 200 gold per minute.",
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
export const MISSION_DEFS: MissionDef[] = [
  {
    id: "frontier-scout",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier Scout",
    description: "Capture 6 neutral tiles.",
    unlockPoints: 0,
    target: 6,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 FOOD +1 SUPPLY"
  },
  {
    id: "frontier-commander",
    kind: "NEUTRAL_CAPTURES",
    name: "Frontier Commander",
    description: "Capture 16 neutral tiles.",
    unlockPoints: 50,
    prerequisiteId: "frontier-scout",
    target: 16,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 IRON +1 CRYSTAL"
  },
  {
    id: "regional-footprint",
    kind: "SETTLED_TILES_HELD",
    name: "Regional Footprint",
    description: "Hold 20 settled tiles at once.",
    unlockPoints: 80,
    target: 20,
    rewardPoints: 0,
    rewardLabel: "Reward: +1 SHARD"
  },
  {
    id: "breadbasket-protocol",
    kind: "FARMS_HELD",
    name: "Breadbasket Protocol",
    description: "Control 4 farms at once.",
    unlockPoints: 140,
    target: 4,
    rewardPoints: 150
  },
  {
    id: "first-bloodline",
    kind: "ENEMY_CAPTURES",
    name: "First Bloodline",
    description: "Capture 3 enemy-owned tiles.",
    unlockPoints: 200,
    target: 3,
    rewardPoints: 220
  },
  {
    id: "victory-rhythm",
    kind: "COMBAT_WINS",
    name: "Victory Rhythm",
    description: "Win 10 combats.",
    unlockPoints: 320,
    target: 10,
    rewardPoints: 300
  },
  {
    id: "tech-apprentice",
    kind: "TECH_PICKS",
    name: "Tech Apprentice",
    description: "Select 3 techs.",
    unlockPoints: 250,
    target: 3,
    rewardPoints: 260
  },
  {
    id: "tech-master",
    kind: "TECH_PICKS",
    name: "Tech Master",
    description: "Select 8 techs.",
    unlockPoints: 600,
    prerequisiteId: "tech-apprentice",
    target: 8,
    rewardPoints: 700
  },
  {
    id: "continental-triad",
    kind: "CONTINENTS_HELD",
    name: "Continental Triad",
    description: "Hold land on 3 continents at once.",
    unlockPoints: 450,
    target: 3,
    rewardPoints: 700
  },
  {
    id: "continental-grip",
    kind: "TILES_HELD",
    name: "Continental Grip",
    description: "Hold 50 tiles at once.",
    unlockPoints: 700,
    target: 50,
    rewardPoints: 600
  },
  {
    id: "agri-hegemon",
    kind: "FARMS_HELD",
    name: "Agri Hegemon",
    description: "Control 10 farms at once.",
    unlockPoints: 1100,
    target: 10,
    rewardPoints: 900
  },
  {
    id: "war-ledger",
    kind: "ENEMY_CAPTURES",
    name: "War Ledger",
    description: "Capture 20 enemy-owned tiles.",
    unlockPoints: 1500,
    target: 20,
    rewardPoints: 1200
  }
];
export const colorFromId = (id: string): string => {
  let h = 2166136261;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  const c = (1 - Math.abs((2 * 0.48) - 1)) * 0.7;
  const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
  const m = 0.48 - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (hue < 60) [r, g, b] = [c, x, 0];
  else if (hue < 120) [r, g, b] = [x, c, 0];
  else if (hue < 180) [r, g, b] = [0, c, x];
  else if (hue < 240) [r, g, b] = [0, x, c];
  else if (hue < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const toHex = (n: number): string => Math.round((n + m) * 255).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};
