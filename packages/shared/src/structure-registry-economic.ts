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
  UMBRITE_RIG: "leatherworking",
  MINE: "mining",
  MINTWORKS: "trade",
  GRANARY: "pottery",
  SEED_GRANARY: "pottery",
  CLEARING_HOUSE: "coinage",
  AIRPORT: "aeronautics",
  // "plastics" is not a standalone researchable tech (removed from
  // tech-tree.json) -- it's granted automatically alongside any of the 7
  // techs in TECHS_THAT_ALSO_UNLOCK_AETHER_TOWER (tech-aether-tower-unlock.ts,
  // apps/simulation), so this is satisfied the moment a player researches
  // any of the structures that need the tower's power.
  AETHER_TOWER: "plastics",
  UMBRITE_SYNTHESIZER: "workshops",
  ADVANCED_UMBRITE_SYNTHESIZER: "advanced-synthetication",
  TITANIUM_WORKS: "alchemy",
  ADVANCED_TITANIUM_WORKS: "advanced-synthetication",
  CRYSTAL_SYNTHESIZER: "crystal-lattices",
  ADVANCED_CRYSTAL_SYNTHESIZER: "advanced-synthetication",
  CARAVANARY: "ledger-keeping",
  FOUNDRY: "industrial-extraction",
  GARRISON_HALL: "organized-supply",
  CUSTOMS_HOUSE: "trade",
  GOVERNORS_OFFICE: "civil-service",
  RADAR_SYSTEM: "radar",
  LOGISTICS_GUILD: "remade-concordat",
  ASSEMBLY_WORKS: "conveyor-networks",
  TITANIUM_WEAPONS_FACTORY: "masonry",
  UMBRITE_WEAPONS_FACTORY: "leatherworking",
};

// ── Upgrade prerequisites ─────────────────────────────────────────

function upgradePrereq(type: EconomicStructureType): readonly string[] | undefined {
  switch (type) {
    case "ADVANCED_UMBRITE_SYNTHESIZER": return ["UMBRITE_SYNTHESIZER"];
    case "ADVANCED_TITANIUM_WORKS": return ["TITANIUM_WORKS"];
    case "ADVANCED_CRYSTAL_SYNTHESIZER": return ["CRYSTAL_SYNTHESIZER"];
    case "SEED_GRANARY": return ["GRANARY"];
    case "IMPERIAL_EXCHANGE": return ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"];
    case "WORLD_ENGINE": return ["WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3"];
    case "AEGIS_DOME": return ["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3"];
    case "ASTRAL_DOCK": return ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"];
    case "POPULATION_BUREAU": return ["POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3"];
    case "TITANIUM_LEVY": return ["TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"];
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
// UMBRITE_RIG_GOLD_UPKEEP, etc., packages/game-domain/src/server-game-constants/
// server-game-constants.ts) are hardcoded to 0 — NOT because "slot
// occupation replaced upkeep." Slot occupation (structure-slots.ts) is a
// separate mechanism gating whether a structure can be built/exist at all;
// it is not a per-minute drain and was never the reason these are zero.
// Synthesizers are the one family with real, nonzero per-minute GOLD
// upkeep (§6.4): 30 gold/day (Umbrite/Titanium), 40 gold/day (Crystal), Advanced
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
  UMBRITE_RIG: econSpec("UMBRITE_RIG"),
  MINE: econSpec("MINE"),

  // Town-support structures
  MINTWORKS: econSpec("MINTWORKS"),
  GRANARY: econSpec("GRANARY"),
  SEED_GRANARY: econSpec("SEED_GRANARY"),
  CENSUS_HALL: econSpec("CENSUS_HALL"),
  CLEARING_HOUSE: econSpec("CLEARING_HOUSE"),

  // Special-scaling structures
  AIRPORT: econSpec("AIRPORT"),
  AETHER_TOWER: econSpec("AETHER_TOWER"),

  // Converters — 30 gold/day (Umbrite/Titanium) or 40 gold/day (Crystal), Advanced
  // tiers at 1.5x (45/45/60), §6.4.
  UMBRITE_SYNTHESIZER: econSpec("UMBRITE_SYNTHESIZER", {
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  ADVANCED_UMBRITE_SYNTHESIZER: econSpec("ADVANCED_UMBRITE_SYNTHESIZER", {
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  TITANIUM_WORKS: econSpec("TITANIUM_WORKS", {
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  ADVANCED_TITANIUM_WORKS: econSpec("ADVANCED_TITANIUM_WORKS", {
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
  GARRISON_HALL: econSpec("GARRISON_HALL"),
  CUSTOMS_HOUSE: econSpec("CUSTOMS_HOUSE"),
  RAIL_DEPOT: econSpec("RAIL_DEPOT"),
  GOVERNORS_OFFICE: econSpec("GOVERNORS_OFFICE"),
  RADAR_SYSTEM: econSpec("RADAR_SYSTEM"),

  // Manpower branch — new buildings
  // QUARTERMASTERS_OFFICE retired (weak payoff: only discounted Fort/Siege
  // Outpost manpower cost, a one-time build-cost saving that couldn't
  // compete with the escalating per-tech gold tax); intentionally left out
  // of this registry so it can never be newly built again, while
  // types.ts/structure-slots.ts/config.ts/runtime-structure-command-handlers.ts
  // keep supporting any copies a player already owns from before the
  // retirement (no data migration for a live game).
  LOGISTICS_GUILD: econSpec("LOGISTICS_GUILD"),
  ASSEMBLY_WORKS: econSpec("ASSEMBLY_WORKS"),

  // War branch — WEAPONS_WORKSHOP retired (replaced by the two structures
  // below); intentionally left out of this registry so it can never be
  // newly built again, while types.ts/structure-slots.ts/config.ts/
  // frontier-combat.ts keep supporting any copies a player already owns
  // from before the retirement (no data migration for a live game).
  TITANIUM_WEAPONS_FACTORY: econSpec("TITANIUM_WEAPONS_FACTORY"),
  UMBRITE_WEAPONS_FACTORY: econSpec("UMBRITE_WEAPONS_FACTORY"),

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
  TITANIUM_LEVY_PART_1: econSpec("TITANIUM_LEVY_PART_1"),
  TITANIUM_LEVY_PART_2: econSpec("TITANIUM_LEVY_PART_2"),
  TITANIUM_LEVY_PART_3: econSpec("TITANIUM_LEVY_PART_3"),

  // Completed wonders (require their part as prerequisite)
  IMPERIAL_EXCHANGE: econSpec("IMPERIAL_EXCHANGE"),
  WORLD_ENGINE: econSpec("WORLD_ENGINE"),
  AEGIS_DOME: econSpec("AEGIS_DOME"),
  ASTRAL_DOCK: econSpec("ASTRAL_DOCK"),
  POPULATION_BUREAU: econSpec("POPULATION_BUREAU"),
  TITANIUM_LEVY: econSpec("TITANIUM_LEVY"),

  // WOODEN_FORT — uses its own WOODEN_FORT_BUILD_MS constant (10 min).
  // §12.1: FOOD cost is already charged as a resource-slot occupation
  // (structure-slots.ts) — no separate per-minute drain, no gold drain.
  WOODEN_FORT: econSpec("WOODEN_FORT", {
    buildMs: WOODEN_FORT_BUILD_MS,
  }),
};
