import type { EconomicStructureType, FortVariant, SiegeOutpostVariant } from "../types.js";

export type StrategicResourceCostType = "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | "SHARD";
export type BuildableStructureType = "FORT" | "OBSERVATORY" | "SIEGE_OUTPOST" | EconomicStructureType;

type StructureScaling =
  | { kind: "doubling" }
  | { kind: "incremental"; rate: number };

export type StructureCostDefinition = {
  baseGoldCost: number;
  manpowerCost?: number;
  resourceCost?: { resource: StrategicResourceCostType; amount: number };
  resourceOptions?: readonly StrategicResourceCostType[];
  scaling?: StructureScaling;
};

// Build gold costs are zeroed throughout this table per
// docs/manpower-economy-rewrite-plan.md §12: manpower (and, where noted,
// strategic resources) is the sole build cost now — gold only gates
// synthesizers (and, separately, a few structures) on an ONGOING per-minute
// upkeep basis (player-upkeep-incremental.ts), never on the build itself.
// `scaling` fields are kept (harmlessly multiplying zero) rather than
// stripped, since they still describe each structure's intended cost curve
// should build gold ever return.
// docs/replenishment-update-plan.md D17: "every cost lives in one place".
// These are the base (first-tier) manpower costs for the fort and siege
// ladders, and the first-5-free/growth rule for Relay Beacons (D12/D23).
// STRUCTURE_COST_DEFINITIONS and FORT_TIER_LADDER/SIEGE_TIER_LADDER below
// both read from these same constants instead of repeating a literal, so a
// tier's cost can never drift between "what's charged" and "what a ladder
// says" the way WOODEN_FORT's old 30-vs-150 split once did.
const WOODEN_FORT_MANPOWER = 30;
const FORT_MANPOWER = 300;
const TITANIUM_BASTION_MANPOWER = 480;
const THUNDER_BASTION_MANPOWER = 960;
const SIEGE_OUTPOST_MANPOWER = 60;
// D13: siege tiers now scale their manpower (60 / 120 / 240) instead of 60
// at every tier, so their build time scales too (B2's time-follows-cost).
const SIEGE_TOWER_MANPOWER = 120;
const DREAD_TOWER_MANPOWER = 240;
// D12/D23: the first 5 Relay Beacons a player OWNS are instant and free --
// they came down with the landing party, so they only need to be put in
// place. From the 6th, a beacon costs a flat RELAY_BEACON_MANPOWER, same for
// every beacon beyond that (no per-copy growth -- see the 2026-09-25 design
// discussion in docs/replenishment-update-plan.md: compounding per-copy cost
// was judged the wrong lever for "big manpower pool should matter for
// building", which the manpower-cost/build-time system already covers
// without it, and risked stacking badly with any future distance-based cost
// on other structures). Keyed off current owned count, not a season-lifetime
// -built counter -- see relayBeaconManpowerCost's own comment below for why
// that's a deliberate simplification, not the original design discussion's
// "tough luck" intent.
export const RELAY_BEACON_FREE_BEACON_COUNT = 5;
const RELAY_BEACON_MANPOWER = 100;

const STRUCTURE_COST_DEFINITIONS: Record<BuildableStructureType, StructureCostDefinition> = {
  FORT: {
    baseGoldCost: 0,
    manpowerCost: FORT_MANPOWER,
    resourceCost: { resource: "TITANIUM", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  OBSERVATORY: {
    baseGoldCost: 0,
    manpowerCost: 80,
    resourceCost: { resource: "CRYSTAL", amount: 45 },
    scaling: { kind: "doubling" }
  },
  SIEGE_OUTPOST: {
    baseGoldCost: 0,
    manpowerCost: SIEGE_OUTPOST_MANPOWER,
    resourceCost: { resource: "UMBRITE", amount: 45 },
    scaling: { kind: "incremental", rate: 0.1 }
  },
  // Manpower costs below implement docs/manpower-economy-rewrite-plan.md §4.1/§4.4
  // and the full table in §12: every economic structure now costs manpower as
  // its primary cost, in round tiers (80/100/150/300/400) anchored to Settle's
  // 20 (acquisition always a little cheaper than optimization, §4.2's ordering
  // rule). Resource costs are left as-is here — converting them to the slot
  // model is §5 (Step 5), out of scope for this pass.
  FARMSTEAD: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 20 } },
  WATERWORKS: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 20 } },
  UMBRITE_RIG: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "UMBRITE", amount: 30 } },
  MINE: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "TITANIUM", amount: 30 }, resourceOptions: ["TITANIUM", "CRYSTAL"] },
  MINTWORKS: { baseGoldCost: 0, manpowerCost: 150 },
  GRANARY: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 40 } },
  SEED_GRANARY: { baseGoldCost: 0, manpowerCost: 100, resourceCost: { resource: "FOOD", amount: 80 } },
  CENSUS_HALL: { baseGoldCost: 0, manpowerCost: 80, resourceCost: { resource: "FOOD", amount: 30 } },
  CLEARING_HOUSE: { baseGoldCost: 0, manpowerCost: 150, resourceCost: { resource: "CRYSTAL", amount: 80 } },
  AIRPORT: {
    baseGoldCost: 0,
    manpowerCost: 150,
    scaling: { kind: "doubling" }
  },
  AETHER_TOWER: {
    baseGoldCost: 0,
    manpowerCost: 400,
    resourceCost: { resource: "CRYSTAL", amount: 160 },
    scaling: { kind: "incremental", rate: 0.15 }
  },
  WOODEN_FORT: {
    baseGoldCost: 0,
    manpowerCost: WOODEN_FORT_MANPOWER,
    scaling: { kind: "incremental", rate: 0.1 }
  },
  // docs/replenishment-update-plan.md D12/D23: the first RELAY_BEACON_FREE_
  // COUNT beacons a player OWNS are instant and free (they came down with
  // the landing party) -- see relayBeaconManpowerCost below, the real
  // per-build cost function every caller uses instead of this flat
  // definition. This entry stays at the flat post-free-count cost (what the
  // 6th+ beacon costs, same for every beacon after that -- no growth) so
  // callers that only read structureCostDefinition/structureBuildManpowerCost
  // generically (client cost-display fallback, STRUCTURE_REGISTRY's econSpec)
  // show a sane number rather than 0.
  RELAY_BEACON: { baseGoldCost: 0, manpowerCost: RELAY_BEACON_MANPOWER },
  UMBRITE_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_UMBRITE_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "UMBRITE", amount: 40 } },
  TITANIUM_WORKS: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_TITANIUM_WORKS: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "TITANIUM", amount: 40 } },
  CRYSTAL_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 150 },
  ADVANCED_CRYSTAL_SYNTHESIZER: { baseGoldCost: 0, manpowerCost: 300, resourceCost: { resource: "CRYSTAL", amount: 40 } },
  CARAVANARY: { baseGoldCost: 0, manpowerCost: 150 },
  FOUNDRY: { baseGoldCost: 0, manpowerCost: 300 },
  GARRISON_HALL: { baseGoldCost: 0, manpowerCost: 150 },
  CUSTOMS_HOUSE: { baseGoldCost: 0, manpowerCost: 100 },
  RAIL_DEPOT: { baseGoldCost: 0, manpowerCost: 300 },
  GOVERNORS_OFFICE: { baseGoldCost: 0, manpowerCost: 150 },
  RADAR_SYSTEM: { baseGoldCost: 0, manpowerCost: 300 },
  QUARTERMASTERS_OFFICE: { baseGoldCost: 0, manpowerCost: 150 },
  LOGISTICS_GUILD: { baseGoldCost: 0, manpowerCost: 150 },
  ASSEMBLY_WORKS: { baseGoldCost: 0, manpowerCost: 300 },
  // Retired (see structure-registry-economic.ts) — not in ECONOMIC_SPECS so
  // it can no longer be built, but the cost definition stays here since
  // STRUCTURE_COST_DEFINITIONS is a Record over the full BuildableStructureType
  // union, and any legacy copy a player still owns may read from it.
  WEAPONS_WORKSHOP: { baseGoldCost: 0, manpowerCost: 100 },
  // Each Titanium/Umbrite Weapons Factory can be built without limit anywhere
  // to specialize their war economy. Flat manpower cost per copy (2026-09-25:
  // an earlier pass had this compounding 15% per existing copy -- removed as
  // the wrong lever for making a large manpower pool matter, see the design
  // discussion in docs/replenishment-update-plan.md).
  TITANIUM_WEAPONS_FACTORY: { baseGoldCost: 0, manpowerCost: 100 },
  UMBRITE_WEAPONS_FACTORY: { baseGoldCost: 0, manpowerCost: 100 },
  IMPERIAL_EXCHANGE_PART_1: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  IMPERIAL_EXCHANGE_PART_2: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  IMPERIAL_EXCHANGE_PART_3: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  WORLD_ENGINE_PART_1: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  WORLD_ENGINE_PART_2: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  WORLD_ENGINE_PART_3: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  AEGIS_DOME_PART_1: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  AEGIS_DOME_PART_2: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  AEGIS_DOME_PART_3: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  ASTRAL_DOCK_PART_1: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  ASTRAL_DOCK_PART_2: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  ASTRAL_DOCK_PART_3: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  POPULATION_BUREAU_PART_1: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  POPULATION_BUREAU_PART_2: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  POPULATION_BUREAU_PART_3: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  TITANIUM_LEVY_PART_1: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  TITANIUM_LEVY_PART_2: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  TITANIUM_LEVY_PART_3: { baseGoldCost: 0, manpowerCost: 1_000, resourceCost: { resource: "SHARD", amount: 1 } },
  IMPERIAL_EXCHANGE: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  WORLD_ENGINE: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  AEGIS_DOME: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  ASTRAL_DOCK: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  POPULATION_BUREAU: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } },
  TITANIUM_LEVY: { baseGoldCost: 0, manpowerCost: 1_600, resourceCost: { resource: "SHARD", amount: 2 } }
};

// ── Fort tier ladder ───────────────────────────────────────────────
// Single source of truth for fort variant costs and combat multipliers.
// Used by the simulation (runtime.ts), game-domain (fortAttackManpowerMultiplier),
// and the client (action logic, optimistic state, UI controls, menu view).

export type FortTierInfo = {
  variant: FortVariant;
  gold: number;
  titanium: number;
  manpower: number;
  defenseMult: number;
};

export const FORT_TIER_LADDER: Record<FortVariant, FortTierInfo> = {
  WOODEN_FORT:      { variant: "WOODEN_FORT",      gold: 0,  titanium: 0,   manpower: WOODEN_FORT_MANPOWER,      defenseMult: 1.35 },
  FORT:             { variant: "FORT",             gold: 0,  titanium: 45,  manpower: FORT_MANPOWER,             defenseMult: 2.5 },
  TITANIUM_BASTION: { variant: "TITANIUM_BASTION", gold: 0,  titanium: 90,  manpower: TITANIUM_BASTION_MANPOWER, defenseMult: 4 },
  THUNDER_BASTION:  { variant: "THUNDER_BASTION",  gold: 0,  titanium: 180, manpower: THUNDER_BASTION_MANPOWER,  defenseMult: 8 },
};

// Manpower an attacker risks losing hitting a SETTLED target, and the
// muster they must have committed to launch the attack at all (the range's
// max — you can never lose more than you brought). Uniform-random within
// the range regardless of whether the attack wins or loses: replaces the
// old win-cheap/loss-expensive formula, which scaled the same direction as
// win chance itself and let stronger empires steamroll weaker ones both
// more often AND more cheaply. "NONE" covers a SETTLED target with no
// active fort. Barbarian/FRONTIER targets use their own separate (much
// cheaper) raid constants in config.ts and are not covered by this table.
// Each tier's `max` here currently equals that same tier's FORT_TIER_LADDER
// `manpower` (build cost) above — a deliberate design choice ("attacking it
// costs as much as building it"), not a derived/enforced invariant. The two
// tables are independent; a future rebalance of one does not have to touch
// the other, but if you change one and mean to keep them matched, update
// both by hand.
export type AttackManpowerLossRange = { min: number; max: number };

export const ATTACK_MANPOWER_LOSS_RANGE: Record<"NONE" | FortVariant, AttackManpowerLossRange> = {
  NONE:             { min: 40,  max: 60 },
  WOODEN_FORT:      { min: 100, max: 150 },
  FORT:             { min: 200, max: 300 },
  TITANIUM_BASTION: { min: 350, max: 480 },
  THUNDER_BASTION:  { min: 800, max: 960 },
};

export const attackManpowerLossRangeForFort = (fortVariant: FortVariant | undefined): AttackManpowerLossRange =>
  ATTACK_MANPOWER_LOSS_RANGE[fortVariant ?? "NONE"];

export const requiredMusterForFort = (fortVariant: FortVariant | undefined): number =>
  attackManpowerLossRangeForFort(fortVariant).max;

export const FORT_VARIANT_LABELS: Record<FortVariant, string> = {
  WOODEN_FORT: "Palisade",
  FORT: "Fort",
  TITANIUM_BASTION: "Titanium Bastion",
  THUNDER_BASTION: "Thunder Bastion",
};

export const bestFortTierForTech = (has: (id: string) => boolean): FortTierInfo => {
  if (has("steelworking")) return FORT_TIER_LADDER.THUNDER_BASTION;
  if (has("fortified-walls")) return FORT_TIER_LADDER.TITANIUM_BASTION;
  return FORT_TIER_LADDER.FORT;
};

export const nextFortTierForUpgrade = (
  current: FortVariant | undefined,
  has: (id: string) => boolean,
): FortTierInfo | null => {
  const resolved = current ?? "FORT";
  if (resolved === "WOODEN_FORT") return FORT_TIER_LADDER.FORT;
  if (resolved === "FORT" && has("fortified-walls")) return FORT_TIER_LADDER.TITANIUM_BASTION;
  if (resolved === "TITANIUM_BASTION" && has("steelworking")) return FORT_TIER_LADDER.THUNDER_BASTION;
  return null;
};

// ── Siege outpost tier ladder ──────────────────────────────────────
// Single source of truth for siege outpost variant costs and attack multipliers.
// Attack mults match the config constants used by outpost-aura.ts at combat time.

export type SiegeTierInfo = {
  variant: SiegeOutpostVariant;
  gold: number;
  umbrite: number;
  titanium: number;
  manpower: number;
  attackMult: number;
};

export const SIEGE_TIER_LADDER: Record<SiegeOutpostVariant, SiegeTierInfo> = {
  SIEGE_OUTPOST: { variant: "SIEGE_OUTPOST", gold: 0, umbrite: 45,  titanium: 0,   manpower: SIEGE_OUTPOST_MANPOWER, attackMult: 1.6 },
  SIEGE_TOWER:   { variant: "SIEGE_TOWER",   gold: 0, umbrite: 90,  titanium: 60,  manpower: SIEGE_TOWER_MANPOWER,   attackMult: 1.8 },
  DREAD_TOWER:   { variant: "DREAD_TOWER",   gold: 0, umbrite: 140, titanium: 120, manpower: DREAD_TOWER_MANPOWER,   attackMult: 2.0 },
};

export const SIEGE_VARIANT_LABELS: Record<SiegeOutpostVariant, string> = {
  SIEGE_OUTPOST: "Siege Battery",
  SIEGE_TOWER: "Siege Tower",
  DREAD_TOWER: "Dread Tower",
};

export const bestSiegeTierForTech = (has: (id: string) => boolean): SiegeTierInfo => {
  if (has("standing-army")) return SIEGE_TIER_LADDER.DREAD_TOWER;
  if (has("siegecraft")) return SIEGE_TIER_LADDER.SIEGE_TOWER;
  return SIEGE_TIER_LADDER.SIEGE_OUTPOST;
};

export const nextSiegeTierForUpgrade = (
  current: SiegeOutpostVariant | undefined,
  has: (id: string) => boolean,
): SiegeTierInfo | null => {
  const resolved = current ?? "SIEGE_OUTPOST";
  if (resolved === "SIEGE_OUTPOST" && has("siegecraft")) return SIEGE_TIER_LADDER.SIEGE_TOWER;
  if (resolved === "SIEGE_TOWER" && has("standing-army")) return SIEGE_TIER_LADDER.DREAD_TOWER;
  return null;
};

export const structureCostDefinition = (type: BuildableStructureType): StructureCostDefinition => STRUCTURE_COST_DEFINITIONS[type];

export const structureBaseGoldCost = (type: BuildableStructureType): number => STRUCTURE_COST_DEFINITIONS[type].baseGoldCost;

export const structureBuildManpowerCost = (type: BuildableStructureType): number =>
  STRUCTURE_COST_DEFINITIONS[type].manpowerCost ?? 0;

export const structureBuildGoldCost = (type: BuildableStructureType, existingCount: number): number => {
  const definition = STRUCTURE_COST_DEFINITIONS[type];
  if (!definition.scaling) return definition.baseGoldCost;
  if (definition.scaling.kind === "doubling") return definition.baseGoldCost * 2 ** existingCount;
  return Math.ceil(definition.baseGoldCost * (1 + definition.scaling.rate) ** existingCount);
};

// docs/replenishment-update-plan.md D12/D23: the first RELAY_BEACON_FREE_
// BEACON_COUNT beacons a player owns are free/instant; the 6th+ costs a flat
// RELAY_BEACON_MANPOWER, same for every beacon after that (2026-09-25: no
// longer grows per beacon -- see the design discussion above
// RELAY_BEACON_FREE_BEACON_COUNT). `existingOwnedCount` here is the player's
// current OWNED count (same convention structureBuildManpowerCostScaled's
// other callers already use, e.g. ownedStructureCountForPlayer) -- so, unlike
// the "built this season" ideal the design discussion landed on, a destroyed
// beacon does hand the free slot back. Tracking a true lifetime-built counter
// would need a new persisted, season-scoped per-player field; deferred as a
// known simplification rather than adding that state here.
export const relayBeaconManpowerCost = (existingOwnedCount: number): number =>
  existingOwnedCount < RELAY_BEACON_FREE_BEACON_COUNT ? 0 : RELAY_BEACON_MANPOWER;

// Every structure's manpower cost is flat regardless of how many the player
// already owns, except Relay Beacon's first-N-free rule above. `existingCount`
// is accepted for a uniform signature across callers (dev-queue reservation,
// build/removal handlers) that don't know in advance which structure type
// they're pricing.
export const structureBuildManpowerCostScaled = (type: BuildableStructureType, existingCount: number): number =>
  type === "RELAY_BEACON" ? relayBeaconManpowerCost(existingCount) : STRUCTURE_COST_DEFINITIONS[type].manpowerCost ?? 0;

// docs/replenishment-update-plan.md D9: "build time = manpower cost x 36s /
// build-speed multiplier" -- 100 MP = 1 hour. Structures only (settle,
// expand, attacks and muster keep their own, unrelated timers -- this
// function family never covered those). Replaces the old flat per-type
// FORT_BUILD_MS/OBSERVATORY_BUILD_MS/SIEGE_OUTPOST_BUILD_MS/
// ECONOMIC_STRUCTURE_BUILD_MS/WOODEN_FORT_BUILD_MS/RELAY_BEACON_BUILD_MS
// constants (config.js) these two functions used to read.
export const MANPOWER_COST_MS_PER_POINT = 36_000;

export const structureBuildDurationMsForManpowerCost = (manpowerCost: number): number =>
  Math.max(0, Math.round(manpowerCost * MANPOWER_COST_MS_PER_POINT));

export const economicStructureBuildDurationMs = (type: EconomicStructureType, existingCount = 0): number => {
  if (type === "RELAY_BEACON") return structureBuildDurationMsForManpowerCost(relayBeaconManpowerCost(existingCount));
  return structureBuildDurationMsForManpowerCost(structureBuildManpowerCostScaled(type, existingCount));
};

export const structureBuildDurationMs = (type: BuildableStructureType, existingCount = 0): number => {
  // FORT/SIEGE_OUTPOST here mean each family's BASE tier (WOODEN_FORT-less
  // FORT, first SIEGE_OUTPOST) -- a resolved tier upgrade's real duration is
  // computed server-side straight from that tier's own manpower cost
  // (runtime-structure-command-handlers.ts), not through this lookup.
  if (type === "FORT") return structureBuildDurationMsForManpowerCost(FORT_TIER_LADDER.FORT.manpower);
  if (type === "SIEGE_OUTPOST") return structureBuildDurationMsForManpowerCost(SIEGE_TIER_LADDER.SIEGE_OUTPOST.manpower);
  if (type === "OBSERVATORY") return structureBuildDurationMsForManpowerCost(structureBuildManpowerCost("OBSERVATORY"));
  return economicStructureBuildDurationMs(type, existingCount);
};
