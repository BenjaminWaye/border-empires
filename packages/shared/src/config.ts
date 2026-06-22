declare const process: {
  env: {
    MUSTER_SYSTEM_ENABLED?: string;
    BREAKTHROUGH_ENABLED?: string;
    EMPIRE_INTEGRITY_ENABLED?: string;
  };
};

export const WORLD_WIDTH = 450;
export const WORLD_HEIGHT = 450;
export const CHUNK_SIZE = 64;
export const VISION_RADIUS = 4;
export const COMBAT_LOCK_MS = 3_000;
export const FRONTIER_CLAIM_COST = 1;
export const FRONTIER_CLAIM_MS = 1_250;
export const FOREST_FRONTIER_CLAIM_MULT = 4;
export const SETTLE_COST = 4;
export const SETTLE_MS = 60_000;
export const DEVELOPMENT_PROCESS_LIMIT = 3;

export const DEF_MULT_MIN = 0.0;
export const DEF_MULT_MAX = 1.0;
export const DEF_SIZE_PENALTY = 0.08;
export const DEF_OVEREXPOSURE_PENALTY = 1.2;
export const DEF_OVEREXPOSURE_SHARPNESS = 6;

export const RATING_A = 1.0;
export const RATING_B = 2.0;
export const UNDERDOG_K = 2.0;

export const STAMINA_MAX = 10;
export const STAMINA_REGEN_MS = 120_000;
export const MANPOWER_BASE_CAP = 150;
// Regen tuned so a single settlement fills its cap in ~12 hours (cap / 720 min).
// Acts as a floor in playerManpowerRegenPerMinute, so it must scale with the
// per-tier regen below — otherwise the tier values are masked.
export const MANPOWER_BASE_REGEN_PER_MINUTE = 150 / 720;
export const MANPOWER_EPSILON = 1e-6;
export const TOWN_MANPOWER_BY_TIER: Record<
  "SETTLEMENT" | "TOWN" | "CITY" | "GREAT_CITY" | "METROPOLIS",
  { cap: number; regenPerMinute: number }
> = {
  SETTLEMENT: { cap: 150, regenPerMinute: 150 / 720 },
  TOWN: { cap: 300, regenPerMinute: 300 / 720 },
  CITY: { cap: 600, regenPerMinute: 600 / 720 },
  GREAT_CITY: { cap: 1_200, regenPerMinute: 1_200 / 720 },
  METROPOLIS: { cap: 2_400, regenPerMinute: 2_400 / 720 }
};
export const manpowerRegenWeightForSettlementIndex = (index: number): number => {
  if (index < 5) return 1;
  if (index < 15) return 0.5;
  return 0.2;
};
export const ATTACK_MANPOWER_MIN = 60;
export const ATTACK_MANPOWER_COST = 60;
export const DEEP_STRIKE_MANPOWER_MIN = 100;
export const DEEP_STRIKE_MANPOWER_COST = 120;
export const NAVAL_INFILTRATION_MANPOWER_MIN = 100;
export const NAVAL_INFILTRATION_MANPOWER_COST = 120;

export const PVP_REPEAT_WINDOW_MS = 10 * 60_000;
export const PVP_REPEAT_FLOOR = 0.1;

export const LEVEL_CURVE_C = 2.2;

export const FORT_BUILD_MS = 10 * 60_000;
export const FORT_BUILD_COST = 900;
export const FORT_DEFENSE_MULT = 2.5;
export const WOODEN_FORT_BUILD_MS = 10 * 60_000;
export const WOODEN_FORT_DEFENSE_MULT = 1.35;

export const OBSERVATORY_BUILD_MS = 10 * 60_000;
export const OBSERVATORY_VISION_BONUS = 5;
export const OBSERVATORY_UPKEEP_PER_MIN = 0.025;
/** Single unified base range for both cast radius and protection field. */
export const OBSERVATORY_RANGE = 20;
/** Max effective range after all tech/domain bonuses (real max 36, buffer at 40). */
export const OBSERVATORY_RANGE_MAX = 40;
/** Alias kept so existing imports continue to compile. Now equals OBSERVATORY_RANGE. */
export const OBSERVATORY_PROTECTION_RADIUS = OBSERVATORY_RANGE;
/** Alias kept so existing imports continue to compile. Now equals OBSERVATORY_RANGE. */
export const OBSERVATORY_CAST_RADIUS = OBSERVATORY_RANGE;

export const ECONOMIC_STRUCTURE_BUILD_MS = 5 * 60_000;
export const ECONOMIC_STRUCTURE_REMOVE_MS = 5 * 60_000;
export const LIGHT_OUTPOST_BUILD_MS = 60_000;
export const LIGHT_OUTPOST_ATTACK_MULT = 1.25;
export const SIEGE_OUTPOST_BUILD_MS = 60_000;
export const SIEGE_OUTPOST_BUILD_COST = 900;
export const SIEGE_OUTPOST_ATTACK_MULT = 1.6;
export const SIEGE_TOWER_ATTACK_MULT = 1.8;
export const DREAD_TOWER_ATTACK_MULT = 2.0;
export const OUTPOST_ATTACK_REACH = 2;

export const DOCK_DEFENSE_MULT = 1.5;
export const DOCK_CROSSING_COOLDOWN_MS = 30_000;
export const DOCK_PAIRS_MIN = 15;
export const DOCK_PAIRS_MAX = 45;

export const CLUSTER_COUNT_MIN = 238;
export const CLUSTER_COUNT_MAX = 238;

export const SEASON_LENGTH_DAYS = 30;

export const BARBARIAN_ACTION_INTERVAL_MS = 15_000;
export const BARBARIAN_MULTIPLY_THRESHOLD = 3;
// Soft population cap. Once barbarian-1 owns this many tiles, multiplication
// is suppressed (over-threshold walks behave as plain walks, carrying their
// stored progress to the target so they immediately re-multiply once the
// population drops below the cap). Prevents the unbounded growth that crushed
// gateway event-loop fan-out during the PR #311 rollout.
export const BARBARIAN_POPULATION_CAP = 200;
export const BARBARIAN_CLEAR_GOLD_REWARD = 5;
export const BARBARIAN_ATTACK_POWER = 1.0;
export const BARBARIAN_DEFENSE_POWER = 0.67;
export const INITIAL_BARBARIAN_COUNT = 80;

// --- Mustering system (Phase 0) ---
// Master switch. When false, the game behaves exactly as before.
export const MUSTER_SYSTEM_ENABLED =
  process.env.MUSTER_SYSTEM_ENABLED === "true";

// How much mustered manpower one ordinary attack costs (placeholder).
// Also used as the fill-ratio reference for the muster flag animation.
export const MUSTER_ATTACK_COST = 60;
// Inflow rate per tile per minute — 60 manpower in ~20 s at base.
export const MUSTER_BASE_RATE_PER_MIN = 180;
// Maximum manpower a single muster tile can hold.
export const MUSTER_TILE_CAP = 150;
// Max simultaneous muster tiles per player.
export const MUSTER_MAX_TILES = 5;
// Auto-clear stale musters after this many milliseconds since the flag was set.
export const MUSTER_STALE_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
// Multiplier to muster inflow when the tile is inside an outpost depot zone.
export const MUSTER_DEPOT_SPEED_MULT = 2.0;
// Chebyshev radius of an outpost depot's effect (5x5 => radius 2).
export const OUTPOST_DEPOT_RADIUS = 2;

// --- Barbarian raids ---
export const BARBARIAN_RAID_COST = 10; // cheap, no muster wind-up

// --- Fort garrison (Phase 7) ---
export const FORT_GARRISON_CAP_BY_VARIANT: Record<string, number> = {
  WOODEN_FORT: 120,
  FORT: 120,
  IRON_BASTION: 240,
  THUNDER_BASTION: 360,
};
// Fraction of the attacking force the garrison loses on a REPULSED assault.
export const FORT_GARRISON_ATTRITION_MIN = 0.05;
export const FORT_GARRISON_ATTRITION_MAX = 0.15;

// --- Breakthrough momentum ---
export const BREAKTHROUGH_ENABLED = process.env["BREAKTHROUGH_ENABLED"] === "true";
export const BREAKTHROUGH_DEBUFF_MULT = 0.7;
export const BREAKTHROUGH_DURATION_MS = 60_000;

// --- Empire Integrity ---
export const EMPIRE_INTEGRITY_ENABLED = process.env["EMPIRE_INTEGRITY_ENABLED"] === "true";
export const INTEGRITY_ECON_MIN_MULT = 0.85;
export const INTEGRITY_ECON_MAX_MULT = 1.15;
export const INTEGRITY_GROWTH_MIN_MULT = 0.9;
export const INTEGRITY_GROWTH_MAX_MULT = 1.1;
