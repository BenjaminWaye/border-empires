import { WORLD_HEIGHT, WORLD_WIDTH, structureBaseGoldCost, type PopulationTier, type TileKey } from "@border-empires/shared";
import type { AbilityDefinition, MissionDef, StrategicResource, VictoryPressureDefinition } from "./server-shared-types.js";

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
export const TRUCE_BREAK_LOCKOUT_MS = 12 * 60 * 60_000;
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
export const BREAKTHROUGH_GOLD_COST = 2;
export const BREAKTHROUGH_IRON_COST = 1;
export const FORT_BUILD_IRON_COST = 45;
export const SIEGE_OUTPOST_BUILD_SUPPLY_COST = 45;
export const SYNTH_OVERLOAD_GOLD_COST = 12_500;
export const SYNTH_OVERLOAD_DISABLE_MS = 24 * 60 * 60_000;
export const FUR_SYNTHESIZER_OVERLOAD_SUPPLY = 15;
export const IRONWORKS_OVERLOAD_IRON = 15;
export const CRYSTAL_SYNTHESIZER_OVERLOAD_CRYSTAL = 10;
export const BREAKTHROUGH_DEF_MULT_FACTOR = 0.6;
export const BREAKTHROUGH_REQUIRED_TECH_ID = "breach-doctrine";
export const OBSERVATORY_BUILD_COST = structureBaseGoldCost("OBSERVATORY");
export const OBSERVATORY_VISION_BONUS = 5;
export const OBSERVATORY_BUILD_CRYSTAL_COST = 45;
export const OBSERVATORY_PROTECTION_RADIUS = 10;
export const OBSERVATORY_CAST_RADIUS = 30;
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
export const BANK_BUILD_GOLD_COST = structureBaseGoldCost("BANK");
export const AIRPORT_BUILD_GOLD_COST = structureBaseGoldCost("AIRPORT");
export const AIRPORT_BUILD_CRYSTAL_COST = 80;
export const FUR_SYNTHESIZER_BUILD_GOLD_COST = structureBaseGoldCost("FUR_SYNTHESIZER");
export const IRONWORKS_BUILD_GOLD_COST = structureBaseGoldCost("IRONWORKS");
export const CRYSTAL_SYNTHESIZER_BUILD_GOLD_COST = structureBaseGoldCost("CRYSTAL_SYNTHESIZER");
export const FUEL_PLANT_BUILD_GOLD_COST = structureBaseGoldCost("FUEL_PLANT");
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
export const TOWN_MANPOWER_BY_TIER: Record<PopulationTier, { cap: number; regenPerMinute: number }> = {
  SETTLEMENT: { cap: 150, regenPerMinute: 10 },
  TOWN: { cap: 300, regenPerMinute: 15 },
  CITY: { cap: 600, regenPerMinute: 30 },
  GREAT_CITY: { cap: 1_200, regenPerMinute: 60 },
  METROPOLIS: { cap: 2_400, regenPerMinute: 120 }
};
export const SETTLEMENT_BASE_GOLD_PER_MIN = 1;
export const FUR_SYNTHESIZER_GOLD_UPKEEP = 60;
export const IRONWORKS_GOLD_UPKEEP = 60;
export const CRYSTAL_SYNTHESIZER_GOLD_UPKEEP = 80;
export const MARKET_FOOD_UPKEEP = 0.5;
export const WOODEN_FORT_GOLD_UPKEEP = 5;
export const LIGHT_OUTPOST_GOLD_UPKEEP = 5;
export const BANK_FOOD_UPKEEP = 1;
export const FUEL_PLANT_GOLD_UPKEEP = 180;
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
export const FUEL_PLANT_OIL_PER_DAY = 10;
export const AIRPORT_OIL_UPKEEP_PER_MIN = 0.025;
export const AIRPORT_BOMBARD_OIL_COST = 1;
export const AIRPORT_BOMBARD_RANGE = 30;
export const AIRPORT_BOMBARD_ATTACK_MULT = 0.95;
export const AIRPORT_BOMBARD_MIN_FIELD_TILES = 2;
export const AIRPORT_BOMBARD_MAX_FIELD_TILES = 4;
export const STRUCTURE_OUTPUT_MULT = 1.5;
export const FOUNDRY_RADIUS = 10;
export const FOUNDRY_OUTPUT_MULT = 2;
export const GOVERNORS_OFFICE_RADIUS = 10;
export const GOVERNORS_OFFICE_UPKEEP_MULT = 0.8;
export const RADAR_SYSTEM_RADIUS = 30;
export const REVEAL_EMPIRE_ACTIVATION_COST = 20;
export const REVEAL_EMPIRE_UPKEEP_PER_MIN = 0.015;
export const REVEAL_EMPIRE_STATS_CRYSTAL_COST = 15;
export const REVEAL_EMPIRE_STATS_COOLDOWN_MS = 5 * 60_000;
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
export const SIPHON_CRYSTAL_COST = 20;
export const SIPHON_COOLDOWN_MS = 15 * 60_000;
export const SIPHON_DURATION_MS = 30 * 60_000;
export const SIPHON_SHARE = 0.5;
export const SIPHON_PURGE_CRYSTAL_COST = 10;
export const TERRAIN_SHAPING_GOLD_COST = 8000;
export const TERRAIN_SHAPING_CRYSTAL_COST = 400;
export const TERRAIN_SHAPING_COOLDOWN_MS = 20 * 60_000;
export const TERRAIN_SHAPING_RANGE = 2;
export const PLAYER_MOUNTAIN_DENSITY_RADIUS = 5;
export const PLAYER_MOUNTAIN_DENSITY_LIMIT = 3;
export const NEW_SETTLEMENT_DEFENSE_MS = 15 * 60_000;
export const POPULATION_GROWTH_BASE_RATE = 0.00032;
export const POPULATION_MIN = 3_000;
export const POPULATION_MAX = 10_000_000;
export const POPULATION_START_SPREAD = 2_000;
export const POPULATION_TOWN_MIN = 10_000;
export const WORLD_TOWN_POPULATION_MIN = 15_000;
export const WORLD_TOWN_POPULATION_START_SPREAD = 10_000;
export const POPULATION_GROWTH_TICK_MS = 60_000;
export const GROWTH_PAUSE_MS = 60 * 60_000;
export const GROWTH_PAUSE_MAX_MS = 6 * 60 * 60_000;
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
export const SEASON_VICTORY_SETTLED_TERRITORY_SHARE = 0.66;
export const SEASON_VICTORY_ECONOMY_MIN_INCOME = 200;
export const SEASON_VICTORY_ECONOMY_LEAD_MULT = 1.33;
export const SEASON_VICTORY_CONTINENT_FOOTPRINT_SHARE = 0.1;
export const VICTORY_PRESSURE_FRONTIER_REACH_WINDOW_MS = 2 * 60 * 60_000;
export const VICTORY_PRESSURE_DEFS: VictoryPressureDefinition[] = [
  {
    id: "TOWN_CONTROL",
    name: "Town Control",
    description: "Control 50% of all towns in the world.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "SETTLED_TERRITORY",
    name: "Settled Territory",
    description: "Settle at least 66% of all claimable land in the world.",
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
    description: "Control all tiles of at least one world resource type.",
    holdDurationSeconds: SEASON_VICTORY_HOLD_MS / 1000
  },
  {
    id: "CONTINENT_FOOTPRINT",
    name: "Continental Footprint",
    description: "Settle at least 10% of claimable land on every island.",
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
