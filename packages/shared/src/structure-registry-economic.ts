import { ECONOMIC_STRUCTURE_BUILD_MS, WOODEN_FORT_BUILD_MS } from "./config.js";
import type { StructureSpec } from "./structure-registry.js";
import {
  noConflictingStructure,
  noDuplicateStructureType,
  ownerOwnsTile,
  tileIsLand,
  tileIsSettled,
} from "./structure-registry.js";
import type { EconomicStructureType, TileUpkeepEntry } from "./types.js";

// ── Economic family ────────────────────────────────────────────────

const economicPlacement: StructureSpec["placement"] = [
  ownerOwnsTile,
  tileIsSettled,
  tileIsLand,
  noConflictingStructure,
  noDuplicateStructureType,
];

// ── Tech requirements (single source of truth) ────────────────────

export const TECH_REQUIREMENTS_BY_STRUCTURE: Partial<Record<EconomicStructureType, string>> = {
  FARMSTEAD: "agriculture",
  CAMP: "leatherworking",
  MINE: "mining",
  MARKET: "trade",
  GRANARY: "pottery",
  SEED_GRANARY: "seed-granaries",
  BANK: "coinage",
  AIRPORT: "aeronautics",
  FUR_SYNTHESIZER: "workshops",
  ADVANCED_FUR_SYNTHESIZER: "advanced-synthetication",
  IRONWORKS: "alchemy",
  ADVANCED_IRONWORKS: "advanced-synthetication",
  CRYSTAL_SYNTHESIZER: "crystal-lattices",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced-synthetication",
  CARAVANARY: "ledger-keeping",
  FOUNDRY: "industrial-extraction",
  GARRISON_HALL: "organization",
  CUSTOMS_HOUSE: "trade",
  GOVERNORS_OFFICE: "civil-service",
  RADAR_SYSTEM: "radar",
};

// ── Upgrade prerequisites ─────────────────────────────────────────

function upgradePrereq(type: EconomicStructureType): readonly string[] | undefined {
  switch (type) {
    case "ADVANCED_FUR_SYNTHESIZER": return ["FUR_SYNTHESIZER"];
    case "ADVANCED_IRONWORKS": return ["IRONWORKS"];
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return ["CRYSTAL_SYNTHESIZER"];
    case "SEED_GRANARY": return ["GRANARY"];
    case "IMPERIAL_EXCHANGE": return ["IMPERIAL_EXCHANGE_PART"];
    case "WORLD_ENGINE": return ["WORLD_ENGINE_PART"];
    case "AEGIS_DOME": return ["AEGIS_DOME_PART"];
    case "ASTRAL_DOCK": return ["ASTRAL_DOCK_PART"];
    default: return undefined;
  }
}

// ── Upkeep (per-minute rates from structureUpkeepPerMinute in ─────
//    player-update-economy.ts — constants / 10 for interval-bucket values,
//    direct for per-minute constants) ────────────────────────────────

const GOLD_UPKEEP = (rate: number): TileUpkeepEntry => ({
  label: "Gold upkeep",
  perMinute: { GOLD: rate },
});

const FOOD_UPKEEP = (rate: number): TileUpkeepEntry => ({
  label: "Food upkeep",
  perMinute: { FOOD: rate },
});

const CRYSTAL_UPKEEP = (rate: number): TileUpkeepEntry => ({
  label: "Crystal upkeep",
  perMinute: { CRYSTAL: rate },
});

// ── Helper ─────────────────────────────────────────────────────────

function econSpec(
  type: EconomicStructureType,
  gold: number,
  opts?: {
    manpower?: number;
    strategic?: StructureSpec["cost"]["strategic"];
    techIds?: string[];
    prerequisiteStructureTypes?: readonly string[];
    upkeep?: ReadonlyArray<TileUpkeepEntry>;
    buildMs?: number;
  },
): StructureSpec {
  const prereqs = opts?.prerequisiteStructureTypes ?? upgradePrereq(type);
  return {
    type,
    kind: "ECONOMIC",
    cost: {
      gold,
      manpower: opts?.manpower ?? 0,
      ...(opts?.strategic ? { strategic: opts.strategic } : {}),
    },
    buildMs: opts?.buildMs ?? ECONOMIC_STRUCTURE_BUILD_MS,
    techIds: opts?.techIds
      ? opts.techIds
      : TECH_REQUIREMENTS_BY_STRUCTURE[type]
        ? [TECH_REQUIREMENTS_BY_STRUCTURE[type]!]
        : [],
    ...(prereqs ? { prerequisiteStructureTypes: prereqs } : {}),
    consumesDevelopmentSlot: true,
    placement: economicPlacement,
    upkeep: opts?.upkeep ?? [],
    tileField: "economicStructure",
  };
}

// ── Registry ───────────────────────────────────────────────────────

export const ECONOMIC_SPECS: Record<string, StructureSpec> = {
  // Resource-tile structures
  FARMSTEAD: econSpec("FARMSTEAD", 700, {
    strategic: { FOOD: 20 },
    upkeep: [GOLD_UPKEEP(0.1)],
  }),
  WATERWORKS: econSpec("WATERWORKS", 600, { strategic: { FOOD: 20 } }),
  CAMP: econSpec("CAMP", 800, {
    strategic: { SUPPLY: 30 },
    upkeep: [GOLD_UPKEEP(0.12)],
  }),
  MINE: econSpec("MINE", 800, {
    strategic: { IRON: 30 },
    upkeep: [GOLD_UPKEEP(0.12)],
  }),

  // Town-support structures
  MARKET: econSpec("MARKET", 2_200, {
    upkeep: [FOOD_UPKEEP(0.05)],
  }),
  GRANARY: econSpec("GRANARY", 700, {
    strategic: { FOOD: 40 },
    upkeep: [GOLD_UPKEEP(0.1)],
  }),
  SEED_GRANARY: econSpec("SEED_GRANARY", 1_400, { strategic: { FOOD: 80 } }),
  CENSUS_HALL: econSpec("CENSUS_HALL", 900, { strategic: { FOOD: 30 } }),
  BANK: econSpec("BANK", 3_200, {
    upkeep: [FOOD_UPKEEP(0.1)],
  }),
  CLEARING_HOUSE: econSpec("CLEARING_HOUSE", 3_000, { strategic: { CRYSTAL: 80 } }),

  // Special-scaling structures
  AIRPORT: econSpec("AIRPORT", 3_000, {
    strategic: { CRYSTAL: 80 },
    upkeep: [CRYSTAL_UPKEEP(0.025)],
  }),
  AETHER_TOWER: econSpec("AETHER_TOWER", 6_000, { strategic: { CRYSTAL: 160 } }),

  // Converters — 6 gold/min (FUR/IRON) or 8 gold/min (CRYSTAL)
  FUR_SYNTHESIZER: econSpec("FUR_SYNTHESIZER", 2_200, {
    upkeep: [GOLD_UPKEEP(6)],
  }),
  ADVANCED_FUR_SYNTHESIZER: econSpec("ADVANCED_FUR_SYNTHESIZER", 4_000, {
    strategic: { SUPPLY: 40 },
    upkeep: [GOLD_UPKEEP(6)],
  }),
  IRONWORKS: econSpec("IRONWORKS", 2_400, {
    upkeep: [GOLD_UPKEEP(6)],
  }),
  ADVANCED_IRONWORKS: econSpec("ADVANCED_IRONWORKS", 4_200, {
    strategic: { IRON: 40 },
    upkeep: [GOLD_UPKEEP(6)],
  }),
  CRYSTAL_SYNTHESIZER: econSpec("CRYSTAL_SYNTHESIZER", 2_800, {
    upkeep: [GOLD_UPKEEP(8)],
  }),
  ADVANCED_CRYSTAL_SYNTHESIZER: econSpec("ADVANCED_CRYSTAL_SYNTHESIZER", 4_800, {
    strategic: { CRYSTAL: 40 },
    upkeep: [GOLD_UPKEEP(8)],
  }),

  // Military-support structures
  CARAVANARY: econSpec("CARAVANARY", 2_600, {
    upkeep: [FOOD_UPKEEP(0.075)],
  }),
  FOUNDRY: econSpec("FOUNDRY", 4_500, {
    upkeep: [GOLD_UPKEEP(5)],
  }),
  EXCHANGE_HOUSE: econSpec("EXCHANGE_HOUSE", 5_000, {
    strategic: { CRYSTAL: 120 },
  }),
  GARRISON_HALL: econSpec("GARRISON_HALL", 2_200, {
    strategic: { CRYSTAL: 80 },
    upkeep: [GOLD_UPKEEP(2.5)],
  }),
  CUSTOMS_HOUSE: econSpec("CUSTOMS_HOUSE", 1_800, {
    strategic: { CRYSTAL: 60 },
    upkeep: [GOLD_UPKEEP(1.5)],
  }),
  RAIL_DEPOT: econSpec("RAIL_DEPOT", 4_000, {
    strategic: { CRYSTAL: 100 },
  }),
  GOVERNORS_OFFICE: econSpec("GOVERNORS_OFFICE", 2_600, {
    upkeep: [GOLD_UPKEEP(3)],
  }),
  RADAR_SYSTEM: econSpec("RADAR_SYSTEM", 4_000, {
    strategic: { CRYSTAL: 120 },
    upkeep: [GOLD_UPKEEP(4.5)],
  }),

  // Wonder parts
  IMPERIAL_EXCHANGE_PART: econSpec("IMPERIAL_EXCHANGE_PART", 8_000, {
    strategic: { CRYSTAL: 180 },
  }),
  WORLD_ENGINE_PART: econSpec("WORLD_ENGINE_PART", 8_000, {
    strategic: { CRYSTAL: 180 },
  }),
  AEGIS_DOME_PART: econSpec("AEGIS_DOME_PART", 8_000, {
    strategic: { CRYSTAL: 180 },
  }),
  ASTRAL_DOCK_PART: econSpec("ASTRAL_DOCK_PART", 8_000, {
    strategic: { CRYSTAL: 180 },
  }),

  // Completed wonders (require their part as prerequisite)
  IMPERIAL_EXCHANGE: econSpec("IMPERIAL_EXCHANGE", 18_000, {
    strategic: { SHARD: 2 },
  }),
  WORLD_ENGINE: econSpec("WORLD_ENGINE", 18_000, {
    strategic: { SHARD: 2 },
  }),
  AEGIS_DOME: econSpec("AEGIS_DOME", 18_000, {
    strategic: { SHARD: 2 },
  }),
  ASTRAL_DOCK: econSpec("ASTRAL_DOCK", 18_000, {
    strategic: { SHARD: 2 },
  }),

  // WOODEN_FORT — uses its own WOODEN_FORT_BUILD_MS constant (10 min).
  // Gold upkeep 0.05/min from structureUpkeepPerMinute.
  WOODEN_FORT: econSpec("WOODEN_FORT", 75, {
    manpower: 30,
    buildMs: WOODEN_FORT_BUILD_MS,
    upkeep: [GOLD_UPKEEP(0.05)],
  }),
};
