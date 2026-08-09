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
  WATERWORKS: "irrigation",
  CAMP: "leatherworking",
  MINE: "mining",
  MARKET: "trade",
  GRANARY: "pottery",
  SEED_GRANARY: "pottery",
  BANK: "coinage",
  AIRPORT: "aeronautics",
  AETHER_TOWER: "plastics",
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
  QUARTERMASTERS_OFFICE: "field-logistics",
  LOGISTICS_GUILD: "remade-concordat",
  ASSEMBLY_WORKS: "conveyor-networks",
  WEAPONS_WORKSHOP: "weapons-forging",
};

// ── Upgrade prerequisites ─────────────────────────────────────────

function upgradePrereq(type: EconomicStructureType): readonly string[] | undefined {
  switch (type) {
    case "ADVANCED_FUR_SYNTHESIZER": return ["FUR_SYNTHESIZER"];
    case "ADVANCED_IRONWORKS": return ["IRONWORKS"];
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return ["CRYSTAL_SYNTHESIZER"];
    case "SEED_GRANARY": return ["GRANARY"];
    case "IMPERIAL_EXCHANGE": return ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"];
    case "WORLD_ENGINE": return ["WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3"];
    case "AEGIS_DOME": return ["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3"];
    case "ASTRAL_DOCK": return ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"];
    case "POPULATION_BUREAU": return ["POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3"];
    case "IRON_LEVY": return ["IRON_LEVY_PART_1", "IRON_LEVY_PART_2", "IRON_LEVY_PART_3"];
    default: return undefined;
  }
}

// ── Upkeep ──────────────────────────────────────────────────────────
//
// These entries mirror structureUpkeepPerMinute (apps/simulation/src/
// player-update-economy/player-update-economy.ts — there is also a
// near-duplicate copy in apps/simulation/src/snapshot-economy-helpers.ts
// that has already drifted from this one on the AIRPORT case; neither is
// actually read from THIS registry at runtime, spec.upkeep has zero
// consumers in apps/simulation/src). Non-synthesizer structures are zero
// here because their named upkeep constants (FARMSTEAD_GOLD_UPKEEP,
// CAMP_GOLD_UPKEEP, etc., packages/game-domain/src/server-game-constants/
// server-game-constants.ts) are hardcoded to 0 — NOT because "slot
// occupation replaced upkeep." Slot occupation (structure-slots.ts) is a
// separate mechanism gating whether a structure can be built/exist at all;
// it is not a per-minute drain and was never the reason these are zero.
// Synthesizers are the one family with real, nonzero per-minute GOLD
// upkeep (§6.4): 30 gold/day (Fur/Iron), 40 gold/day (Crystal), Advanced
// tiers at 1.5x (45/45/60), expressed per-minute (÷1440). ─────────────

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

  // Manpower branch — new buildings
  QUARTERMASTERS_OFFICE: econSpec("QUARTERMASTERS_OFFICE"),
  LOGISTICS_GUILD: econSpec("LOGISTICS_GUILD"),
  ASSEMBLY_WORKS: econSpec("ASSEMBLY_WORKS"),

  // War branch
  WEAPONS_WORKSHOP: econSpec("WEAPONS_WORKSHOP"),

  // Wonder parts
  IMPERIAL_EXCHANGE_PART_1: econSpec("IMPERIAL_EXCHANGE_PART_1"),
  IMPERIAL_EXCHANGE_PART_2: econSpec("IMPERIAL_EXCHANGE_PART_2"),
  IMPERIAL_EXCHANGE_PART_3: econSpec("IMPERIAL_EXCHANGE_PART_3"),
  WORLD_ENGINE_PART_1: econSpec("WORLD_ENGINE_PART_1"),
  WORLD_ENGINE_PART_2: econSpec("WORLD_ENGINE_PART_2"),
  WORLD_ENGINE_PART_3: econSpec("WORLD_ENGINE_PART_3"),
  AEGIS_DOME_PART_1: econSpec("AEGIS_DOME_PART_1"),
  AEGIS_DOME_PART_2: econSpec("AEGIS_DOME_PART_2"),
  AEGIS_DOME_PART_3: econSpec("AEGIS_DOME_PART_3"),
  ASTRAL_DOCK_PART_1: econSpec("ASTRAL_DOCK_PART_1"),
  ASTRAL_DOCK_PART_2: econSpec("ASTRAL_DOCK_PART_2"),
  ASTRAL_DOCK_PART_3: econSpec("ASTRAL_DOCK_PART_3"),
  POPULATION_BUREAU_PART_1: econSpec("POPULATION_BUREAU_PART_1"),
  POPULATION_BUREAU_PART_2: econSpec("POPULATION_BUREAU_PART_2"),
  POPULATION_BUREAU_PART_3: econSpec("POPULATION_BUREAU_PART_3"),
  IRON_LEVY_PART_1: econSpec("IRON_LEVY_PART_1"),
  IRON_LEVY_PART_2: econSpec("IRON_LEVY_PART_2"),
  IRON_LEVY_PART_3: econSpec("IRON_LEVY_PART_3"),

  // Completed wonders (require their part as prerequisite)
  IMPERIAL_EXCHANGE: econSpec("IMPERIAL_EXCHANGE"),
  WORLD_ENGINE: econSpec("WORLD_ENGINE"),
  AEGIS_DOME: econSpec("AEGIS_DOME"),
  ASTRAL_DOCK: econSpec("ASTRAL_DOCK"),
  POPULATION_BUREAU: econSpec("POPULATION_BUREAU"),
  IRON_LEVY: econSpec("IRON_LEVY"),

  // WOODEN_FORT — uses its own WOODEN_FORT_BUILD_MS constant (10 min).
  // §12.1: FOOD cost is already charged as a resource-slot occupation
  // (structure-slots.ts) — no separate per-minute drain, no gold drain.
  WOODEN_FORT: econSpec("WOODEN_FORT", {
    buildMs: WOODEN_FORT_BUILD_MS,
  }),
};
