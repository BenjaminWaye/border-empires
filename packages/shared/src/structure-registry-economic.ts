import { ECONOMIC_STRUCTURE_BUILD_MS, WOODEN_FORT_BUILD_MS } from "./config.js";
import { structureCostDefinition } from "./structure-costs/structure-costs.js";
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
//
// gold/manpower/strategic build cost is derived from structureCostDefinition
// (structure-costs.ts) rather than hand-copied here, the same way
// structure-registry-fort.ts/structure-registry-outpost.ts derive from
// FORT_TIER_LADDER/SIEGE_TIER_LADDER — a second, literal copy is what let 10
// of these types' strategic cost drift out of sync with structure-costs.ts
// (caught by structure-registry.test.ts's cost-parity suite).

function econSpec(
  type: EconomicStructureType,
  opts?: {
    upkeep?: ReadonlyArray<TileUpkeepEntry>;
    buildMs?: number;
  },
): StructureSpec {
  const def = structureCostDefinition(type);
  const prereqs = upgradePrereq(type);
  return {
    type,
    kind: "ECONOMIC",
    cost: {
      gold: def.baseGoldCost,
      manpower: def.manpowerCost ?? 0,
      ...(def.resourceCost ? { strategic: { [def.resourceCost.resource]: def.resourceCost.amount } } : {}),
    },
    buildMs: opts?.buildMs ?? ECONOMIC_STRUCTURE_BUILD_MS,
    techIds: TECH_REQUIREMENTS_BY_STRUCTURE[type] ? [TECH_REQUIREMENTS_BY_STRUCTURE[type]!] : [],
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
  FARMSTEAD: econSpec("FARMSTEAD"),
  WATERWORKS: econSpec("WATERWORKS"),
  CAMP: econSpec("CAMP"),
  MINE: econSpec("MINE"),

  // Town-support structures
  MARKET: econSpec("MARKET"),
  GRANARY: econSpec("GRANARY"),
  SEED_GRANARY: econSpec("SEED_GRANARY"),
  CENSUS_HALL: econSpec("CENSUS_HALL"),
  BANK: econSpec("BANK"),
  CLEARING_HOUSE: econSpec("CLEARING_HOUSE"),

  // Special-scaling structures
  AIRPORT: econSpec("AIRPORT"),
  AETHER_TOWER: econSpec("AETHER_TOWER"),

  // Converters — 30 gold/day (Fur/Iron) or 40 gold/day (Crystal), Advanced
  // tiers at 1.5x (45/45/60), §6.4.
  FUR_SYNTHESIZER: econSpec("FUR_SYNTHESIZER", {
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  ADVANCED_FUR_SYNTHESIZER: econSpec("ADVANCED_FUR_SYNTHESIZER", {
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  IRONWORKS: econSpec("IRONWORKS", {
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  ADVANCED_IRONWORKS: econSpec("ADVANCED_IRONWORKS", {
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  CRYSTAL_SYNTHESIZER: econSpec("CRYSTAL_SYNTHESIZER", {
    upkeep: [GOLD_UPKEEP(40 / 1440)],
  }),
  ADVANCED_CRYSTAL_SYNTHESIZER: econSpec("ADVANCED_CRYSTAL_SYNTHESIZER", {
    upkeep: [GOLD_UPKEEP(60 / 1440)],
  }),

  // Military-support structures
  CARAVANARY: econSpec("CARAVANARY"),
  FOUNDRY: econSpec("FOUNDRY"),
  EXCHANGE_HOUSE: econSpec("EXCHANGE_HOUSE"),
  GARRISON_HALL: econSpec("GARRISON_HALL"),
  CUSTOMS_HOUSE: econSpec("CUSTOMS_HOUSE"),
  RAIL_DEPOT: econSpec("RAIL_DEPOT"),
  GOVERNORS_OFFICE: econSpec("GOVERNORS_OFFICE"),
  RADAR_SYSTEM: econSpec("RADAR_SYSTEM"),

  // Wonder parts
  IMPERIAL_EXCHANGE_PART: econSpec("IMPERIAL_EXCHANGE_PART"),
  WORLD_ENGINE_PART: econSpec("WORLD_ENGINE_PART"),
  AEGIS_DOME_PART: econSpec("AEGIS_DOME_PART"),
  ASTRAL_DOCK_PART: econSpec("ASTRAL_DOCK_PART"),

  // Completed wonders (require their part as prerequisite)
  IMPERIAL_EXCHANGE: econSpec("IMPERIAL_EXCHANGE"),
  WORLD_ENGINE: econSpec("WORLD_ENGINE"),
  AEGIS_DOME: econSpec("AEGIS_DOME"),
  ASTRAL_DOCK: econSpec("ASTRAL_DOCK"),

  // WOODEN_FORT — uses its own WOODEN_FORT_BUILD_MS constant (10 min).
  // Food upkeep only (0.1/min) — no gold drain.
  WOODEN_FORT: econSpec("WOODEN_FORT", {
    buildMs: WOODEN_FORT_BUILD_MS,
    upkeep: [{ label: "Food upkeep", perMinute: { FOOD: 0.1 } }],
  }),
};
