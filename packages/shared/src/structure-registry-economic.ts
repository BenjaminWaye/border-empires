import { ECONOMIC_STRUCTURE_BUILD_MS } from "./config.js";
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
  HYDROGARDEN: "agriculture",
  HYDROWORKS: "irrigation",
  UMBRITE_RIG: "leatherworking",
  MINE: "mining",
  MINTWORKS: "trade",
  INCUBATION_ENGINE: "pottery",
  CLEARING_HOUSE: "coinage",
  SKY_DOCK: "aeronautics",
  // "plastics" is not a standalone researchable tech (removed from
  // tech-tree.json) -- it's granted automatically alongside any of the 7
  // techs in TECHS_THAT_ALSO_UNLOCK_AMBARIC_TRANSFORMER (tech-ambaric-transformer-unlock.ts,
  // apps/simulation), so this is satisfied the moment a player researches
  // any of the structures that need the tower's power.
  AMBARIC_TRANSFORMER: "plastics",
  UMBRITE_WORKS: "workshops",
  HIGH_YIELD_UMBRITE_WORKS: "advanced-synthetication",
  TITANIUM_WORKS: "alchemy",
  HIGH_YIELD_TITANIUM_WORKS: "advanced-synthetication",
  AETHER_CONDENSER: "crystal-lattices",
  HIGH_YIELD_AETHER_CONDENSER: "advanced-synthetication",
  TRADE_NEXUS: "ledger-keeping",
  ORE_REFINERY: "industrial-extraction",
  ANCILLARY_DEPOT: "organized-supply",
  HARBOR_EXCHANGE: "trade",
  MINISTRY_HALL: "civil-service",
  RESONANCE_GRID: "radar",
  ANCILLARY_FACTORY: "remade-concordat",
  RESERVE_LATTICE: "conveyor-networks",
  TITANIUM_WEAPONS_FACTORY: "masonry",
  UMBRITE_WEAPONS_FACTORY: "leatherworking",
};

// ── Upgrade prerequisites ─────────────────────────────────────────

function upgradePrereq(type: EconomicStructureType): readonly string[] | undefined {
  switch (type) {
    case "HIGH_YIELD_UMBRITE_WORKS": return ["UMBRITE_WORKS"];
    case "HIGH_YIELD_TITANIUM_WORKS": return ["TITANIUM_WORKS"];
    case "HIGH_YIELD_AETHER_CONDENSER": return ["AETHER_CONDENSER"];
    case "IMPERIAL_EXCHANGE": return ["IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3"];
    case "SOVEREIGN_SIEGE_ENGINE": return ["SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3"];
    case "AEGIS_DOME": return ["AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3"];
    case "ASTRAL_DOCK": return ["ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3"];
    case "CENSUS_DIRECTORATE": return ["CENSUS_DIRECTORATE_PART_1", "CENSUS_DIRECTORATE_PART_2", "CENSUS_DIRECTORATE_PART_3"];
    case "TITANIUM_LEVY": return ["TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"];
    default: return undefined;
  }
}

// ── Upkeep ──────────────────────────────────────────────────────────
//
// These entries mirror structureUpkeepPerMinute (apps/simulation/src/
// player-update-economy/player-update-economy.ts — there is also a
// near-duplicate copy in apps/simulation/src/snapshot-economy-helpers.ts
// that has already drifted from this one on the SKY_DOCK case; neither is
// actually read from THIS registry at runtime, spec.upkeep has zero
// consumers in apps/simulation/src). Non-synthesizer structures are zero
// here because their named upkeep constants (HYDROGARDEN_GOLD_UPKEEP,
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
  HYDROGARDEN: econSpec("HYDROGARDEN"),
  HYDROWORKS: econSpec("HYDROWORKS"),
  UMBRITE_RIG: econSpec("UMBRITE_RIG"),
  MINE: econSpec("MINE"),

  // Town-support structures
  MINTWORKS: econSpec("MINTWORKS"),
  INCUBATION_ENGINE: econSpec("INCUBATION_ENGINE"),
  CENSUS_HALL: econSpec("CENSUS_HALL"),
  CLEARING_HOUSE: econSpec("CLEARING_HOUSE"),

  // Special-scaling structures
  SKY_DOCK: econSpec("SKY_DOCK"),
  AMBARIC_TRANSFORMER: econSpec("AMBARIC_TRANSFORMER"),

  // Converters — 30 gold/day (Umbrite/Titanium) or 40 gold/day (Crystal), Advanced
  // tiers at 1.5x (45/45/60), §6.4.
  UMBRITE_WORKS: econSpec("UMBRITE_WORKS", {
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  HIGH_YIELD_UMBRITE_WORKS: econSpec("HIGH_YIELD_UMBRITE_WORKS", {
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  TITANIUM_WORKS: econSpec("TITANIUM_WORKS", {
    upkeep: [GOLD_UPKEEP(30 / 1440)],
  }),
  HIGH_YIELD_TITANIUM_WORKS: econSpec("HIGH_YIELD_TITANIUM_WORKS", {
    upkeep: [GOLD_UPKEEP(45 / 1440)],
  }),
  AETHER_CONDENSER: econSpec("AETHER_CONDENSER", {
    upkeep: [GOLD_UPKEEP(40 / 1440)],
  }),
  HIGH_YIELD_AETHER_CONDENSER: econSpec("HIGH_YIELD_AETHER_CONDENSER", {
    upkeep: [GOLD_UPKEEP(60 / 1440)],
  }),

  // Military-support structures
  TRADE_NEXUS: econSpec("TRADE_NEXUS"),
  ORE_REFINERY: econSpec("ORE_REFINERY"),
  ANCILLARY_DEPOT: econSpec("ANCILLARY_DEPOT"),
  HARBOR_EXCHANGE: econSpec("HARBOR_EXCHANGE"),
  NEURAL_WORKS: econSpec("NEURAL_WORKS"),
  MINISTRY_HALL: econSpec("MINISTRY_HALL"),
  RESONANCE_GRID: econSpec("RESONANCE_GRID"),

  // Manpower branch — new buildings
  // QUARTERMASTERS_OFFICE retired (weak payoff: only discounted Fort/Siege
  // Outpost manpower cost, a one-time build-cost saving that couldn't
  // compete with the escalating per-tech gold tax); intentionally left out
  // of this registry so it can never be newly built again, while
  // types.ts/structure-slots.ts/config.ts/runtime-structure-command-handlers.ts
  // keep supporting any copies a player already owns from before the
  // retirement (no data migration for a live game).
  ANCILLARY_FACTORY: econSpec("ANCILLARY_FACTORY"),
  RESERVE_LATTICE: econSpec("RESERVE_LATTICE"),

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
  SOVEREIGN_SIEGE_ENGINE_PART_1: econSpec("SOVEREIGN_SIEGE_ENGINE_PART_1"),
  SOVEREIGN_SIEGE_ENGINE_PART_2: econSpec("SOVEREIGN_SIEGE_ENGINE_PART_2"),
  SOVEREIGN_SIEGE_ENGINE_PART_3: econSpec("SOVEREIGN_SIEGE_ENGINE_PART_3"),
  AEGIS_DOME_PART_1: econSpec("AEGIS_DOME_PART_1"),
  AEGIS_DOME_PART_2: econSpec("AEGIS_DOME_PART_2"),
  AEGIS_DOME_PART_3: econSpec("AEGIS_DOME_PART_3"),
  ASTRAL_DOCK_PART_1: econSpec("ASTRAL_DOCK_PART_1"),
  ASTRAL_DOCK_PART_2: econSpec("ASTRAL_DOCK_PART_2"),
  ASTRAL_DOCK_PART_3: econSpec("ASTRAL_DOCK_PART_3"),
  CENSUS_DIRECTORATE_PART_1: econSpec("CENSUS_DIRECTORATE_PART_1"),
  CENSUS_DIRECTORATE_PART_2: econSpec("CENSUS_DIRECTORATE_PART_2"),
  CENSUS_DIRECTORATE_PART_3: econSpec("CENSUS_DIRECTORATE_PART_3"),
  TITANIUM_LEVY_PART_1: econSpec("TITANIUM_LEVY_PART_1"),
  TITANIUM_LEVY_PART_2: econSpec("TITANIUM_LEVY_PART_2"),
  TITANIUM_LEVY_PART_3: econSpec("TITANIUM_LEVY_PART_3"),

  // Completed wonders (require their part as prerequisite)
  IMPERIAL_EXCHANGE: econSpec("IMPERIAL_EXCHANGE"),
  SOVEREIGN_SIEGE_ENGINE: econSpec("SOVEREIGN_SIEGE_ENGINE"),
  AEGIS_DOME: econSpec("AEGIS_DOME"),
  ASTRAL_DOCK: econSpec("ASTRAL_DOCK"),
  CENSUS_DIRECTORATE: econSpec("CENSUS_DIRECTORATE"),
  TITANIUM_LEVY: econSpec("TITANIUM_LEVY"),
};
