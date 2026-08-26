// Power/vision/utility buildings and the six late-game monuments. Most of
// these are mechanic-driven (radius, cooldown, one-time effects) rather than
// a stackable "+N stat" — kept as a small number of descriptive modifier
// lines rather than forcing a fake numeric total (judgment call, see
// structure-modifier-catalog.ts). Monument components (the "*_PART_n"
// intermediates) carry no numeric effect of their own, so they return [].
import {
  AEGIS_DOME_PROTECTION_RADIUS, AEGIS_LOCK_DURATION_MS, AETHER_TOWER_RADIUS, AIRPORT_BOMBARD_RANGE,
  IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS, POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING,
  RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS, TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO, WORLD_ENGINE_STRIKE_GOLD_COST,
  WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO
} from "../server-game-constants/server-game-constants.js";
import { percentLabel, type ModifierStructureType, type StructureModifier } from "./structure-modifier-catalog-types.js";

const MONUMENT_PART_TYPES: ReadonlySet<ModifierStructureType> = new Set([
  "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
  "WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3",
  "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
  "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
  "POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3",
  "TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"
]);

const hoursFromMs = (ms: number): number => Math.round(ms / (60 * 60_000));

export const utilityStructureModifiers = (type: ModifierStructureType): StructureModifier[] | undefined => {
  if (MONUMENT_PART_TYPES.has(type)) return [];
  if (type === "AIRPORT") return [{ statLabel: "Area-strip range", valueText: `${AIRPORT_BOMBARD_RANGE} tiles`, tone: "neutral", isTownWide: false }];
  if (type === "AETHER_TOWER") return [{ statLabel: "Power radius", valueText: `${AETHER_TOWER_RADIUS} tiles`, tone: "positive", isTownWide: false }];
  if (type === "RADAR_SYSTEM") return [{ statLabel: "Bombardment block radius", valueText: `${RADAR_SYSTEM_BOMBARD_BLOCK_RADIUS} tiles`, tone: "positive", isTownWide: false }];
  if (type === "ASTRAL_DOCK") return [{ statLabel: "Full-map vision (24h)", valueText: "Free", tone: "positive", isTownWide: false }];
  if (type === "IMPERIAL_EXCHANGE") return [{ statLabel: `Rival gold levy (every ${hoursFromMs(IMPERIAL_EXCHANGE_LEVY_COOLDOWN_MS)}h)`, valueText: "100%", tone: "positive", isTownWide: false }];
  if (type === "WORLD_ENGINE") {
    return [{
      statLabel: "Worldbreaker strike population loss",
      valueText: `${percentLabel(WORLD_ENGINE_STRIKE_POPULATION_LOSS_RATIO * 100)} for ${WORLD_ENGINE_STRIKE_GOLD_COST.toLocaleString()} gold`,
      tone: "positive",
      isTownWide: false
    }];
  }
  if (type === "AEGIS_DOME") {
    return [
      { statLabel: "Protection radius", valueText: `${AEGIS_DOME_PROTECTION_RADIUS} tiles`, tone: "positive", isTownWide: false },
      { statLabel: "Aegis Lock duration", valueText: `${Math.round(AEGIS_LOCK_DURATION_MS / 60_000)}m`, tone: "positive", isTownWide: false }
    ];
  }
  if (type === "POPULATION_BUREAU") {
    return [{
      statLabel: "Manpower/min per Manpower-branch building owned",
      valueText: `+${POPULATION_BUREAU_REGEN_PER_MANPOWER_BUILDING}`,
      tone: "positive",
      isTownWide: false
    }];
  }
  if (type === "TITANIUM_LEVY") {
    return [{ statLabel: "Banked manpower converted to army (once)", valueText: percentLabel(TITANIUM_LEVY_MANPOWER_CONVERSION_RATIO * 100), tone: "positive", isTownWide: false }];
  }
  return undefined;
};
