import { ECONOMIC_STRUCTURE_BUILD_MS, WOODEN_FORT_BUILD_MS } from "./config.js";
import type { StructureSpec } from "./structure-registry/structure-registry.js";
import {
  noConflictingStructure,
  noDuplicateStructureType,
  ownerOwnsTile,
  tileIsLand,
  tileIsSettled,
} from "./structure-registry/structure-registry.js";
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
  GARRISON_HALL: "organized-supply",
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
//    player-update-economy.ts) — §12.1/§5.1 (docs/manpower-economy-
//    rewrite-plan.md): a structure's slot occupation is its upkeep now,
//    so every non-synthesizer structure carries zero ongoing upkeep here.
//    Synthesizers are the one family gold still gates on an ongoing basis
//    (§6.4): 30 gold/day (Fur/Iron), 40 gold/day (Crystal), Advanced
//    tiers at 1.5x (45/45/60), expressed per-minute (÷1440). ─────────

const GOLD_UPKEEP = (rate: number): TileUpkeepEntry => ({
  label: "Gold upkeep",
  perMinute: { GOLD: rate },
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
  FARMSTEAD: econSpec("FARMSTEAD", 0, {
    manpower: 80,
    strategic: { FOOD: 20 },
  }),
  WATERWORKS: econSpec("WATERWORKS", 0, { manpower: 80, strategic: { FOOD: 20 } }),
  CAMP: econSpec("CAMP", 0, {
    manpower: 80,
    strategic: { SUPPLY: 30 },
  }),
  MINE: econSpec("MINE", 0, {
    manpower: 80,
    strategic: { IRON: 30 },
  }),

  // Town-support structures
  MARKET: econSpec("MARKET", 0, {
    manpower: 150,
  }),
  GRANARY: econSpec("GRANARY", 0, {
    manpower: 80,
    strategic: { FOOD: 40 },
  }),
  SEED_GRANARY: econSpec("SEED_GRANARY", 0, { manpower: 100, strategic: { FOOD: 80 } }),
  CENSUS_HALL: econSpec("CENSUS_HALL", 0, { manpower: 80, strategic: { FOOD: 30 } }),
  BANK: econSpec("BANK", 0, {
    manpower: 300,
  }),
  CLEARING_HOUSE: econSpec("CLEARING_HOUSE", 0, { manpower: 150, strategic: { CRYSTAL: 80 } }),

  // Special-scaling structures
  AIRPORT: econSpec("AIRPORT", 0, {
    manpower: 150,
    strategic: { CRYSTAL: 80 },
  }),
  AETHER_TOWER: econSpec("AETHER_TOWER", 0, { manpower: 400, strategic: { CRYSTAL: 160 } }),

  // Converters — 30 gold/day (Fur/Iron) or 40 gold/day (Crystal), Advanced
  // tiers at 1.5x (45/45/60), §6.4.
  FUR_SYNTHESIZER: econSpec("FUR_SYNTHESIZER", 0, {
    manpower: 150,
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  ADVANCED_FUR_SYNTHESIZER: econSpec("ADVANCED_FUR_SYNTHESIZER", 0, {
    manpower: 300,
    strategic: { SUPPLY: 40 },
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  IRONWORKS: econSpec("IRONWORKS", 0, {
    manpower: 150,
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  ADVANCED_IRONWORKS: econSpec("ADVANCED_IRONWORKS", 0, {
    manpower: 300,
    strategic: { IRON: 40 },
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  CRYSTAL_SYNTHESIZER: econSpec("CRYSTAL_SYNTHESIZER", 0, {
    manpower: 150,
    upkeep: [GOLD_UPKEEP(40 / 1440)],
  }),
  ADVANCED_CRYSTAL_SYNTHESIZER: econSpec("ADVANCED_CRYSTAL_SYNTHESIZER", 0, {
    manpower: 300,
    strategic: { CRYSTAL: 40 },
    upkeep: [GOLD_UPKEEP(60 / 1440)],
  }),

  // Military-support structures
  CARAVANARY: econSpec("CARAVANARY", 0, {
    manpower: 150,
  }),
  FOUNDRY: econSpec("FOUNDRY", 0, {
    manpower: 300,
  }),
  EXCHANGE_HOUSE: econSpec("EXCHANGE_HOUSE", 0, {
    manpower: 400,
    strategic: { CRYSTAL: 120 },
  }),
  GARRISON_HALL: econSpec("GARRISON_HALL", 0, {
    manpower: 150,
    strategic: { CRYSTAL: 80 },
  }),
  CUSTOMS_HOUSE: econSpec("CUSTOMS_HOUSE", 0, {
    manpower: 100,
    strategic: { CRYSTAL: 60 },
  }),
  RAIL_DEPOT: econSpec("RAIL_DEPOT", 0, {
    manpower: 300,
    strategic: { CRYSTAL: 100 },
  }),
  GOVERNORS_OFFICE: econSpec("GOVERNORS_OFFICE", 0, {
    manpower: 150,
  }),
  RADAR_SYSTEM: econSpec("RADAR_SYSTEM", 0, {
    manpower: 300,
    strategic: { CRYSTAL: 120 },
  }),

  // Wonder parts
  IMPERIAL_EXCHANGE_PART: econSpec("IMPERIAL_EXCHANGE_PART", 0, {
    manpower: 1_000,
    strategic: { CRYSTAL: 180 },
  }),
  WORLD_ENGINE_PART: econSpec("WORLD_ENGINE_PART", 0, {
    manpower: 1_000,
    strategic: { CRYSTAL: 180 },
  }),
  AEGIS_DOME_PART: econSpec("AEGIS_DOME_PART", 0, {
    manpower: 1_000,
    strategic: { CRYSTAL: 180 },
  }),
  ASTRAL_DOCK_PART: econSpec("ASTRAL_DOCK_PART", 0, {
    manpower: 1_000,
    strategic: { CRYSTAL: 180 },
  }),

  // Completed wonders (require their part as prerequisite)
  IMPERIAL_EXCHANGE: econSpec("IMPERIAL_EXCHANGE", 0, {
    manpower: 1_600,
    strategic: { SHARD: 2 },
  }),
  WORLD_ENGINE: econSpec("WORLD_ENGINE", 0, {
    manpower: 1_600,
    strategic: { SHARD: 2 },
  }),
  AEGIS_DOME: econSpec("AEGIS_DOME", 0, {
    manpower: 1_600,
    strategic: { SHARD: 2 },
  }),
  ASTRAL_DOCK: econSpec("ASTRAL_DOCK", 0, {
    manpower: 1_600,
    strategic: { SHARD: 2 },
  }),

  // WOODEN_FORT — uses its own WOODEN_FORT_BUILD_MS constant (10 min).
  // §12.1: the IRON slot occupation is its upkeep now, no gold drain.
  WOODEN_FORT: econSpec("WOODEN_FORT", 0, {
    manpower: 30,
    buildMs: WOODEN_FORT_BUILD_MS,
  }),
};
