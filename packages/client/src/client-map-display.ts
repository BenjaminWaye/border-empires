import {
  OBSERVATORY_UPKEEP_PER_MIN, SYNTHESIZER_STRUCTURE_TYPES, TILE_SLOT_BOOST_STRUCTURES, WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS,
  economicStructureBuildDurationMs, structureBuildDurationMs, structureBuildManpowerCost,
  structureCostDefinition, structureSlotRequirements, type BuildableStructureType, type SlotStructureType
} from "@border-empires/shared";
import { OBSERVATORY_VISION_BONUS } from "./client-constants.js";
import { OBSERVATORY_RANGE } from "@border-empires/shared";
import {
  ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY, ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY, CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
  UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY, TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
  mintworksGoldProductionMultiplier, structureModifiersFor, type ModifierStructureType, type StructureModifier
} from "@border-empires/game-domain";
import type { Tile } from "./client-types.js";
import { converterStructureInfoView } from "./client-converter-structure-info.js";

export type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

// mintworks-stacking task: these three call sites are generic/help copy (no
// specific tile/town in scope) describing the PER-MINTWORKS rate, not a real
// town's stacked total — derived from the shared function rather than a
// separate hardcoded literal so the numbers can't drift from it, with
// wording that makes the additive stacking explicit.
const MINTWORKS_PER_MINTWORKS_PERCENT = Math.round((mintworksGoldProductionMultiplier(1, false) - 1) * 100);
const MINTWORKS_PER_MINTWORKS_PERCENT_CLEARING_HOUSE = Math.round((mintworksGoldProductionMultiplier(1, true) - 1) * 100);

export type StructureInfoKey =
  | "FORT"
  | "TITANIUM_BASTION"
  | "THUNDER_BASTION"
  | "OBSERVATORY"
  | "FARMSTEAD"
  | "WATERWORKS"
  | "UMBRITE_RIG"
  | "MINE"
  | "MINTWORKS"
  | "GRANARY"
  | "SEED_GRANARY"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "CARAVANARY"
  | "WOODEN_FORT"
  | "RELAY_BEACON"
  | "UMBRITE_SYNTHESIZER"
  | "ADVANCED_UMBRITE_SYNTHESIZER"
  | "TITANIUM_WORKS"
  | "ADVANCED_TITANIUM_WORKS"
  | "CRYSTAL_SYNTHESIZER"
  | "ADVANCED_CRYSTAL_SYNTHESIZER"
  | "FOUNDRY"
  | "CUSTOMS_HOUSE"
  | "GOVERNORS_OFFICE"
  | "GARRISON_HALL"
  | "AIRPORT"
  | "AETHER_TOWER"
  | "RADAR_SYSTEM"
  | "QUARTERMASTERS_OFFICE"
  | "LOGISTICS_GUILD"
  | "ASSEMBLY_WORKS"
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "ASTRAL_DOCK"
  | "RAIL_DEPOT"
  | "IMPERIAL_EXCHANGE_PART_1"
  | "IMPERIAL_EXCHANGE_PART_2"
  | "IMPERIAL_EXCHANGE_PART_3"
  | "WORLD_ENGINE_PART_1"
  | "WORLD_ENGINE_PART_2"
  | "WORLD_ENGINE_PART_3"
  | "IMPERIAL_EXCHANGE"
  | "WORLD_ENGINE"
  | "AEGIS_DOME_PART_1"
  | "AEGIS_DOME_PART_2"
  | "AEGIS_DOME_PART_3"
  | "AEGIS_DOME"
  | "POPULATION_BUREAU_PART_1"
  | "POPULATION_BUREAU_PART_2"
  | "POPULATION_BUREAU_PART_3"
  | "POPULATION_BUREAU"
  | "TITANIUM_LEVY_PART_1"
  | "TITANIUM_LEVY_PART_2"
  | "TITANIUM_LEVY_PART_3"
  | "TITANIUM_LEVY"
  | "SIEGE_OUTPOST"
  | "SIEGE_TOWER"
  | "DREAD_TOWER"
  | "WEAPONS_WORKSHOP"
  | "TITANIUM_WEAPONS_FACTORY"
  | "UMBRITE_WEAPONS_FACTORY";

export type StructureInfoView = {
  title: string;
  detail: string;
  effects: string[];
  // Structured Modifier-style entries (statLabel/valueText/tone), sourced
  // from the shared game-domain catalog — same data and same
  // white-label/green-value styling as the tile-overview popup. `effects`
  // is kept alongside for bullets that don't cleanly reduce to a number
  // (e.g. "Blocked by Resonance Grids", "Requires nearby Ambaric Tower
  // power").
  modifiers: StructureModifier[];
  glyph: string;
  placement: string;
  image?: string;
  costBits: string[];
  buildTimeLabel: string;
  upkeepBits?: string[];
  // Tech-tree redesign: which of the 4 player-facing branches (War/Economy/
  // Manpower/Aether) this structure belongs to, for the branch-tag UI
  // requirement. Undefined for structures with no tech gate (Wooden
  // Fort/Relay Beacon) or that predate the branch system (monuments span
  // branches by design, left untagged here).
  branch?: "War" | "Economy" | "Manpower" | "Aether";
};

// Every monument's 3 uniquely-named component types, across all 6
// monuments — used anywhere a check needs to apply identically to all 18
// (e.g. the shared "must be in an empty-of-monument-parts Great City"
// effects bullet) instead of hand-listing all 18 names at each call site.
export const MONUMENT_COMPONENT_KEYS: ReadonlySet<StructureInfoKey> = new Set([
  "IMPERIAL_EXCHANGE_PART_1", "IMPERIAL_EXCHANGE_PART_2", "IMPERIAL_EXCHANGE_PART_3",
  "WORLD_ENGINE_PART_1", "WORLD_ENGINE_PART_2", "WORLD_ENGINE_PART_3",
  "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
  "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
  "POPULATION_BUREAU_PART_1", "POPULATION_BUREAU_PART_2", "POPULATION_BUREAU_PART_3",
  "TITANIUM_LEVY_PART_1", "TITANIUM_LEVY_PART_2", "TITANIUM_LEVY_PART_3"
]);

// The 3 uniquely-named components required for each of the 6 monuments, in
// build order — the source the "Monument Components" checklist in the
// structure-info popup reads from (see renderStructureInfoOverlay).
export const MONUMENT_COMPONENTS_BY_BASE: Partial<Record<StructureInfoKey, ReadonlyArray<{ type: StructureInfoKey; name: string }>>> = {
  IMPERIAL_EXCHANGE: [
    { type: "IMPERIAL_EXCHANGE_PART_1", name: "Golden Ledger" },
    { type: "IMPERIAL_EXCHANGE_PART_2", name: "Counting Engine" },
    { type: "IMPERIAL_EXCHANGE_PART_3", name: "Sovereign Seal" }
  ],
  WORLD_ENGINE: [
    { type: "WORLD_ENGINE_PART_1", name: "The Long Barrel" },
    { type: "WORLD_ENGINE_PART_2", name: "Fracture Core" },
    { type: "WORLD_ENGINE_PART_3", name: "Sky-Marking Array" }
  ],
  AEGIS_DOME: [
    { type: "AEGIS_DOME_PART_1", name: "Shield Lattice" },
    { type: "AEGIS_DOME_PART_2", name: "Ward Anchor" },
    { type: "AEGIS_DOME_PART_3", name: "Aegis Crown" }
  ],
  ASTRAL_DOCK: [
    { type: "ASTRAL_DOCK_PART_1", name: "Launch Cradle" },
    { type: "ASTRAL_DOCK_PART_2", name: "Orbital Array" },
    { type: "ASTRAL_DOCK_PART_3", name: "Aether Sail" }
  ],
  POPULATION_BUREAU: [
    { type: "POPULATION_BUREAU_PART_1", name: "Census Engine" },
    { type: "POPULATION_BUREAU_PART_2", name: "Registry Vault" },
    { type: "POPULATION_BUREAU_PART_3", name: "Levy Charter" }
  ],
  TITANIUM_LEVY: [
    { type: "TITANIUM_LEVY_PART_1", name: "Muster Klaxon" },
    { type: "TITANIUM_LEVY_PART_2", name: "Titanium Standard" },
    { type: "TITANIUM_LEVY_PART_3", name: "Levy Writ" }
  ]
};

// Tech-tree redesign: branch tag for the structure build UI. Derived from
// which branch each structure's own tech gate lives in (see
// TECH_REQUIREMENTS_BY_STRUCTURE in structure-registry-economic.ts) --
// listed explicitly here rather than computed from the tech catalog since
// this module has no tech-tree.json access.
const STRUCTURE_BRANCH_BY_KEY: Partial<Record<StructureInfoKey, "War" | "Economy" | "Manpower" | "Aether">> = {
  FORT: "War", TITANIUM_BASTION: "War", THUNDER_BASTION: "War",
  SIEGE_OUTPOST: "War", SIEGE_TOWER: "War", DREAD_TOWER: "War",
  WEAPONS_WORKSHOP: "War",
  TITANIUM_WEAPONS_FACTORY: "War", UMBRITE_WEAPONS_FACTORY: "War",
  FARMSTEAD: "Economy", WATERWORKS: "Economy", MINE: "Economy",
  MINTWORKS: "Economy", CLEARING_HOUSE: "Economy",
  UMBRITE_SYNTHESIZER: "Economy", ADVANCED_UMBRITE_SYNTHESIZER: "Economy",
  TITANIUM_WORKS: "Economy", ADVANCED_TITANIUM_WORKS: "Economy",
  FOUNDRY: "Economy", CUSTOMS_HOUSE: "Economy",
  CARAVANARY: "Economy", GOVERNORS_OFFICE: "Economy",
  IMPERIAL_EXCHANGE_PART_1: "Economy", IMPERIAL_EXCHANGE_PART_2: "Economy", IMPERIAL_EXCHANGE_PART_3: "Economy", IMPERIAL_EXCHANGE: "Economy",
  UMBRITE_RIG: "War",
  GRANARY: "Manpower", SEED_GRANARY: "Manpower", CENSUS_HALL: "Manpower",
  GARRISON_HALL: "Manpower", RAIL_DEPOT: "Manpower",
  QUARTERMASTERS_OFFICE: "Manpower", LOGISTICS_GUILD: "Manpower",
  ASSEMBLY_WORKS: "Manpower",
  POPULATION_BUREAU_PART_1: "Manpower", POPULATION_BUREAU_PART_2: "Manpower", POPULATION_BUREAU_PART_3: "Manpower", POPULATION_BUREAU: "Manpower",
  TITANIUM_LEVY_PART_1: "Manpower", TITANIUM_LEVY_PART_2: "Manpower", TITANIUM_LEVY_PART_3: "Manpower", TITANIUM_LEVY: "Manpower",
  OBSERVATORY: "Aether", CRYSTAL_SYNTHESIZER: "Aether",
  ADVANCED_CRYSTAL_SYNTHESIZER: "Aether", AIRPORT: "Aether",
  AETHER_TOWER: "Aether", RADAR_SYSTEM: "Aether",
  ASTRAL_DOCK_PART_1: "Aether", ASTRAL_DOCK_PART_2: "Aether", ASTRAL_DOCK_PART_3: "Aether", ASTRAL_DOCK: "Aether",
  AEGIS_DOME_PART_1: "War", AEGIS_DOME_PART_2: "War", AEGIS_DOME_PART_3: "War", AEGIS_DOME: "War",
  WORLD_ENGINE_PART_1: "War", WORLD_ENGINE_PART_2: "War", WORLD_ENGINE_PART_3: "War", WORLD_ENGINE: "War"
};

// Structure display names live in their own module (single source of truth,
// consumed by tech-unlock chips, tech-effect blurbs, tile overview
// modifiers, and build-action labels) — re-exported here since this is the
// module every existing importer of economicStructureName already uses.
export { STRUCTURE_DISPLAY_NAMES, economicStructureName } from "./client-structure-display-names.js";

export const economicStructureBenefitText = (type: EconomicStructureType | StructureInfoKey): string => {
  const kind = type as string;
  if (kind === "MINTWORKS") return `+10 gold instantly on completion, +1 gold/day, and +${MINTWORKS_PER_MINTWORKS_PERCENT}% nearby town gold production per Mintworks (+${MINTWORKS_PER_MINTWORKS_PERCENT_CLEARING_HOUSE}% with an active Clearing House) — stacks additively with every other active Mintworks supporting the town.`;
  if (kind === "GRANARY") return "Grants an instant one-time +10,000 population burst to the supported town on completion.";
  if (kind === "SEED_GRANARY") return "Upgrades a granary into a seed granary with +30% local town population growth and lower local town food upkeep.";
  if (kind === "CENSUS_HALL") return "Grants +20,000 population to the supported town for every connected city with an active Incubation Engine, and cuts that town's tier-upgrade cost by 25%.";
  if (kind === "CLEARING_HOUSE") return "Strengthens the Mintworks for this town and its directly connected towns.";
  if (kind === "AIRPORT") return "Launches crystal-powered bombardment that strips enemy ownership from a 3×3 area (structures survive). Free to fire, 20m cooldown. Blocked by Resonance Grids.";
  if (kind === "AETHER_TOWER") return "Powers nearby late-game sky and monument structures.";
  if (kind === "WOODEN_FORT") return "Provides a lighter fortified defense on this owned border tile.";
  if (kind === "RELAY_BEACON") return "Provides a lighter attack bonus from this owned border tile.";
  if (kind === "CARAVANARY") return "Builds the road network itself — towns only share their connected-town income bonus if at least one has a Trade Nexus.";
  // converter-mode-flip plan §Phase 6: this building can run either
  // direction now — mode-neutral summary with both figures, since a
  // one-directional description is simply false half the time.
  // In Refine mode the converter SUPPLIES +1 slot of the family resource
  // (isSlotSourceConverter, resource-slot-view.ts) — no ongoing daily output;
  // that production-number mechanic was retired by the resource-slot rewrite
  // (§5). In Sell off mode it instead OCCUPIES 1 slot and converts it to gold.
  if (kind === "UMBRITE_SYNTHESIZER") return `Refine: gold → supplies +1 UMBRITE slot (${UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY} gold/day upkeep). Sell off: occupies 1 UMBRITE slot → gold (8 gold/day).`;
  if (kind === "ADVANCED_UMBRITE_SYNTHESIZER") return `Refine: gold → supplies +1 UMBRITE slot (${ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY} gold/day upkeep). Sell off: occupies 1 UMBRITE slot → gold (12 gold/day).`;
  if (kind === "TITANIUM_WORKS") return `Refine: gold → supplies +1 TITANIUM slot (${TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY} gold/day upkeep). Sell off: occupies 1 TITANIUM slot → gold (8 gold/day).`;
  if (kind === "ADVANCED_TITANIUM_WORKS") return `Refine: gold → supplies +1 TITANIUM slot (${ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY} gold/day upkeep). Sell off: occupies 1 TITANIUM slot → gold (12 gold/day).`;
  if (kind === "CRYSTAL_SYNTHESIZER") return `Refine: gold → supplies +1 CRYSTAL slot (${CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY} gold/day upkeep). Sell off: occupies 1 CRYSTAL slot → gold (10 gold/day).`;
  if (kind === "ADVANCED_CRYSTAL_SYNTHESIZER") return `Refine: gold → supplies +1 CRYSTAL slot (${ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY} gold/day upkeep). Sell off: occupies 1 CRYSTAL slot → gold (15 gold/day).`;
  if (kind === "FOUNDRY") return "Doubles active Mine slot output within a 5-tile radius.";
  if (kind === "GARRISON_HALL") return "Adds +150 manpower cap to this town (+300 more if an Assembly Works is in this town's connected network).";
  if (kind === "CUSTOMS_HOUSE") return "Adds +5 gold / day for each connected owned dock.";
  if (kind === "GOVERNORS_OFFICE") return "Reduces a nearby town's FOOD slot demand by its own tier step (e.g. -1 for City, -2 for Great City) within 10 tiles.";
  if (kind === "RADAR_SYSTEM") return "Blocks enemy sky bombardment in a 30-tile radius.";
  if (kind === "QUARTERMASTERS_OFFICE") return "Reduces manpower cost by 33% for War-branch structures (Fort/Siege ladders) built within 20 tiles. Does not stack with other Quartermaster's Offices.";
  if (kind === "LOGISTICS_GUILD") return "Adds +0.05 manpower/min empire-wide, standalone. A Rail Depot in this town's connected network amplifies it to +0.1/min.";
  if (kind === "ASSEMBLY_WORKS") return "Amplifies every Ancillary Factory in its connected-town network (+300 manpower cap each). One per connected-town network.";
  if (kind === "ASTRAL_DOCK_PART_1") return "Launch Cradle — one of the Astral Dock's 3 required components.";
  if (kind === "ASTRAL_DOCK_PART_2") return "Orbital Array — one of the Astral Dock's 3 required components.";
  if (kind === "ASTRAL_DOCK_PART_3") return "Aether Sail — one of the Astral Dock's 3 required components.";
  if (kind === "ASTRAL_DOCK") return "Unique world monument. Free to launch, once every 24 hours, one satellite that reveals full-map vision for 24 hours.";
  if (kind === "RAIL_DEPOT") return "Mustering hub that amplifies every Logistics Guild in its connected-town network (+0.1 manpower/min each) and speeds up nearby outpost muster.";
  if (kind === "IMPERIAL_EXCHANGE_PART_1") return "Golden Ledger — one of the Imperial Exchange's 3 required components.";
  if (kind === "IMPERIAL_EXCHANGE_PART_2") return "Counting Engine — one of the Imperial Exchange's 3 required components.";
  if (kind === "IMPERIAL_EXCHANGE_PART_3") return "Sovereign Seal — one of the Imperial Exchange's 3 required components.";
  if (kind === "WORLD_ENGINE_PART_1") return "The Long Barrel — one of the Worldbreaker Cannon's 3 required components.";
  if (kind === "WORLD_ENGINE_PART_2") return "Fracture Core — one of the Worldbreaker Cannon's 3 required components.";
  if (kind === "WORLD_ENGINE_PART_3") return "Sky-Marking Array — one of the Worldbreaker Cannon's 3 required components.";
  if (kind === "IMPERIAL_EXCHANGE") return "Unique world monument. Free, once every 24 hours, it can levy 100% of a single chosen rival's gold.";
  if (kind === "AEGIS_DOME_PART_1") return "Shield Lattice — one of the Aegis Dome's 3 required components.";
  if (kind === "AEGIS_DOME_PART_2") return "Ward Anchor — one of the Aegis Dome's 3 required components.";
  if (kind === "AEGIS_DOME_PART_3") return "Aegis Crown — one of the Aegis Dome's 3 required components.";
  if (kind === "AEGIS_DOME") return "Unique world monument. Projects a 25-tile shield and can trigger a free 15-minute Aegis Lock every 60 minutes.";
  if (kind === "WORLD_ENGINE") return "Unique world monument. Every 10 minutes, it can fire one Worldbreaker shot anywhere on the map that destroys an enemy structure and cuts that town's population by 30%, for 1,000 gold.";
  if (kind === "POPULATION_BUREAU_PART_1") return "Census Engine — one of the Population Bureau's 3 required components.";
  if (kind === "POPULATION_BUREAU_PART_2") return "Registry Vault — one of the Population Bureau's 3 required components.";
  if (kind === "POPULATION_BUREAU_PART_3") return "Levy Charter — one of the Population Bureau's 3 required components.";
  if (kind === "POPULATION_BUREAU") return "Unique world monument. Adds +0.1 manpower/min empire-wide for every Manpower-branch building you own.";
  if (kind === "TITANIUM_LEVY_PART_1") return "Muster Klaxon — one of The Titanium Levy's 3 required components.";
  if (kind === "TITANIUM_LEVY_PART_2") return "Titanium Standard — one of The Titanium Levy's 3 required components.";
  if (kind === "TITANIUM_LEVY_PART_3") return "Levy Writ — one of The Titanium Levy's 3 required components.";
  if (kind === "TITANIUM_LEVY") return "Unique world monument. Converts 50% of your currently-banked manpower into an instant one-time army, then freezes empire-wide manpower regen for 2 hours.";
  if (kind === "FARMSTEAD") return `Adds +${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD} FOOD slot on this tile.`;
  if (kind === "WATERWORKS") return `Every Farmstead within a 10-tile radius gains +${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS} FOOD slots.`;
  if (kind === "UMBRITE_RIG") return "Adds +1 UMBRITE slot on this tile.";
  if (kind === "MINE") return "Adds +1 slot of titanium or crystal (whichever this tile produces).";
  if (kind === "WEAPONS_WORKSHOP") return "Forges Titanium and Umbrite into titanium-alloy plating and charged energy blades, granting a small empire-wide attack and defense boost. Uncapped per town — build many to raise a dedicated military city.";
  if (kind === "TITANIUM_WEAPONS_FACTORY") return "Occupies 1 TITANIUM slot. Forges armor plating for +1.5% attack / +3% defense per copy — armor doctrine. The bonus is empire-wide, like Weapons Workshop. Uncapped — no per-town limit.";
  if (kind === "UMBRITE_WEAPONS_FACTORY") return "Occupies 1 UMBRITE slot. Outfits raiders for +3% attack / +1.5% defense per copy — raiding doctrine. The bonus is empire-wide, like Weapons Workshop. Uncapped — no per-town limit.";
  return "Strengthens this tile's economy.";
};

export const economicStructureBuildMs = (type: EconomicStructureType): number => {
  return economicStructureBuildDurationMs(type);
};

export const structureInfoForKey = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string }
): StructureInfoView => {
  const structureBaseKey = (
    key: StructureInfoKey
  ):
    | "FORT"
    | "OBSERVATORY"
    | "SIEGE_OUTPOST"
    | "FARMSTEAD"
    | "UMBRITE_RIG"
    | "MINE"
    | "MINTWORKS"
    | "GRANARY"
    | "CENSUS_HALL"
    | "CLEARING_HOUSE"
    | "CARAVANARY"
    | "AIRPORT"
    | "AETHER_TOWER"
    | "WOODEN_FORT"
    | "RELAY_BEACON"
    | "UMBRITE_SYNTHESIZER"
    | "ADVANCED_UMBRITE_SYNTHESIZER"
    | "TITANIUM_WORKS"
    | "ADVANCED_TITANIUM_WORKS"
    | "CRYSTAL_SYNTHESIZER"
    | "ADVANCED_CRYSTAL_SYNTHESIZER"
    | "FOUNDRY"
    | "GARRISON_HALL"
    | "CUSTOMS_HOUSE"
    | "RAIL_DEPOT"
    | "GOVERNORS_OFFICE"
    | "RADAR_SYSTEM"
    | "QUARTERMASTERS_OFFICE"
    | "LOGISTICS_GUILD"
    | "ASSEMBLY_WORKS"
    | "ASTRAL_DOCK_PART_1"
    | "ASTRAL_DOCK_PART_2"
    | "ASTRAL_DOCK_PART_3"
    | "ASTRAL_DOCK"
    | "IMPERIAL_EXCHANGE_PART_1"
    | "IMPERIAL_EXCHANGE_PART_2"
    | "IMPERIAL_EXCHANGE_PART_3"
    | "WORLD_ENGINE_PART_1"
    | "WORLD_ENGINE_PART_2"
    | "WORLD_ENGINE_PART_3"
    | "AEGIS_DOME_PART_1"
    | "AEGIS_DOME_PART_2"
    | "AEGIS_DOME_PART_3"
    | "AEGIS_DOME"
    | "IMPERIAL_EXCHANGE"
    | "WORLD_ENGINE"
    | "POPULATION_BUREAU_PART_1"
    | "POPULATION_BUREAU_PART_2"
    | "POPULATION_BUREAU_PART_3"
    | "POPULATION_BUREAU"
    | "TITANIUM_LEVY_PART_1"
    | "TITANIUM_LEVY_PART_2"
    | "TITANIUM_LEVY_PART_3"
    | "TITANIUM_LEVY"
    | "WEAPONS_WORKSHOP"
    | "TITANIUM_WEAPONS_FACTORY"
    | "UMBRITE_WEAPONS_FACTORY" => {
    if (key === "TITANIUM_BASTION") return "FORT";
    if (key === "THUNDER_BASTION") return "FORT";
    if (key === "SIEGE_TOWER") return "SIEGE_OUTPOST";
    if (key === "DREAD_TOWER") return "SIEGE_OUTPOST";
    if (key === "WATERWORKS") return "FARMSTEAD";
    if (key === "SEED_GRANARY") return "GRANARY";
    if (key === "RAIL_DEPOT") return "RAIL_DEPOT";
    return key;
  };
  const buildTimeLabelFor = (key: StructureInfoKey): string =>
    deps.formatCooldownShort(structureBuildDurationMs(structureBaseKey(key)));
  // Only the six synthesizer types have any real, ongoing gold upkeep in the
  // simulation (apps/simulation/src/player-update-economy/player-update-economy.ts
  // structureUpkeepPerMinute). Every other structure's real per-minute upkeep
  // was retired to 0 by the manpower-economy rewrite — its permanent resource
  // slot occupation (below) IS its upkeep now, so no gold/food/iron/etc drain
  // line applies to it.
  const SYNTHESIZER_GOLD_UPKEEP_PER_DAY: Partial<Record<StructureInfoKey, number>> = {
    UMBRITE_SYNTHESIZER: UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
    ADVANCED_UMBRITE_SYNTHESIZER: ADVANCED_UMBRITE_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
    TITANIUM_WORKS: TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
    ADVANCED_TITANIUM_WORKS: ADVANCED_TITANIUM_WORKS_GOLD_UPKEEP_PER_DAY,
    CRYSTAL_SYNTHESIZER: CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY,
    ADVANCED_CRYSTAL_SYNTHESIZER: ADVANCED_CRYSTAL_SYNTHESIZER_GOLD_UPKEEP_PER_DAY
  };
  const upkeepBitsFor = (key: StructureInfoKey): string[] => {
    const bits: string[] = [];
    const goldUpkeepPerDay = SYNTHESIZER_GOLD_UPKEEP_PER_DAY[key];
    if (goldUpkeepPerDay !== undefined) bits.push(`${goldUpkeepPerDay} gold / day`);
    const baseKey = structureBaseKey(key);
    if (!SYNTHESIZER_STRUCTURE_TYPES.includes(baseKey as BuildableStructureType)) {
      const slotKey: SlotStructureType =
        key === "TITANIUM_BASTION" || key === "THUNDER_BASTION" || key === "SIEGE_TOWER" || key === "DREAD_TOWER"
          ? key
          : (baseKey as SlotStructureType);
      for (const requirement of structureSlotRequirements(slotKey)) {
        bits.push(`${requirement.count} ${requirement.resource} slot${requirement.count === 1 ? "" : "s"}`);
      }
    }
    return bits;
  };
  // Numeric effects now live in `modifiers` (structureModifiersFor, below) —
  // this list is only for qualitative bullets that don't reduce to a
  // Modifier line (mechanic descriptions, "requires power", limits, etc).
  const effectsFor = (key: StructureInfoKey): string[] => {
    if (key === "FORT") return ["Prevents failed attacks from immediately flipping the fortified origin tile"];
    if (key === "TITANIUM_BASTION") return ["Upgrades Forts into Titanium Bastions", "Also keeps the +10% settled defense from Bastion Walls"];
    if (key === "THUNDER_BASTION") return ["Upgrades Titanium Bastions into Thunder Bastions", "Improves resistance to siege and lance pressure"];
    if (key === "OBSERVATORY") return ["Crystal range grows with tech"];
    if (key === "WOODEN_FORT") return ["Light defensive fortification", "No iron upkeep"];
    if (key === "RELAY_BEACON") return ["Cheap offensive staging point", "Faster, weaker alternative to a Siege Outpost"];
    if (key === "SIEGE_OUTPOST") return ["Improves attacks launched from this tile"];
    if (key === "SIEGE_TOWER") return ["Upgrades Siege Outposts into Siege Towers"];
    if (key === "DREAD_TOWER") return ["Upgrades Siege Towers into Dread Towers, effective against heavy fortified targets"];
    if (key === "FARMSTEAD") return ["Farm tiles only — no effect on fish tiles"];
    if (key === "WATERWORKS") return [];
    if (key === "UMBRITE_RIG") return [];
    if (key === "MINE") return [];
    if (key === "MINTWORKS") return ["Stacks additively across every active Mintworks in the town"];
    if (key === "GRANARY") return [];
    if (key === "SEED_GRANARY") return [];
    if (key === "CENSUS_HALL") return [];
    if (key === "CLEARING_HOUSE") return [];
    if (key === "CARAVANARY") return ["Enables the connected-town income bonus for this road network"];
    if (key === "UMBRITE_SYNTHESIZER" || key === "ADVANCED_UMBRITE_SYNTHESIZER") return ["Sell off: 1 umbrite slot → gold"];
    if (key === "TITANIUM_WORKS" || key === "ADVANCED_TITANIUM_WORKS") return ["Sell off: 1 titanium slot → gold"];
    if (key === "CRYSTAL_SYNTHESIZER" || key === "ADVANCED_CRYSTAL_SYNTHESIZER") return ["Sell off: 1 crystal slot → gold"];
    if (key === "FOUNDRY") return [];
    if (key === "CUSTOMS_HOUSE") return [];
    if (key === "GOVERNORS_OFFICE") return [];
    if (key === "GARRISON_HALL") return ["Also boosts manpower cap further if an Assembly Works is in this town's connected network"];
    if (key === "AIRPORT") return ["Strips ownership from a 3×3 area (structures survive)", "Free • 20m cooldown", "Blocked by Resonance Grids", "Requires nearby Ambaric Tower power"];
    if (key === "AETHER_TOWER") return ["Powers nearby Aetherports, Resonance Grids, and monuments", "Can chain power through other Ambaric Towers"];
    if (key === "RADAR_SYSTEM") return ["Requires nearby Ambaric Tower power"];
    if (key === "QUARTERMASTERS_OFFICE") return ["Does not stack with other Quartermaster's Offices"];
    if (key === "LOGISTICS_GUILD") return ["Boosted rate applies instead of the standalone rate when a Rail Depot is in this town's connected network"];
    if (key === "ASSEMBLY_WORKS") return ["One per connected-town network"];
    if (MONUMENT_COMPONENT_KEYS.has(key)) return ["One of the monument's 3 required unique components", "Must be built in a Great City or Monumental City that has no other monument component"];
    if (key === "ASTRAL_DOCK") return ["Unique world monument", "Must wait for the current satellite to come down before relaunching", "Requires nearby Ambaric Tower power"];
    if (key === "RAIL_DEPOT") return ["Boosts outpost muster speed within 50 tiles", "One per connected-town network"];
    if (key === "IMPERIAL_EXCHANGE") return ["Unique world monument", "Free", "Requires nearby Ambaric Tower power"];
    if (key === "AEGIS_DOME") return ["Unique world monument", "Aegis Lock prevents hostile ownership changes in that radius, free", "Requires nearby Ambaric Tower power"];
    if (key === "WORLD_ENGINE") return ["Unique world monument", "Every 10 minutes, anywhere on the map", "Requires nearby Ambaric Tower power"];
    if (key === "POPULATION_BUREAU") return ["Unique world monument"];
    if (key === "TITANIUM_LEVY") return ["Unique world monument", "Freezes empire-wide manpower regen afterward", "Requires nearby Ambaric Tower power"];
    if (key === "WEAPONS_WORKSHOP") return ["No per-town limit — build as many as you like to specialize a town for war"];
    if (key === "TITANIUM_WEAPONS_FACTORY") return ["Escalating manpower cost — each additional copy you own costs more", "No per-town limit — armor doctrine"];
    if (key === "UMBRITE_WEAPONS_FACTORY") return ["Escalating manpower cost — each additional copy you own costs more", "No per-town limit — raiding doctrine"];
    return [];
  };
  const modifiersFor = (key: StructureInfoKey): StructureModifier[] => structureModifiersFor(key as unknown as ModifierStructureType, {});
  const structure = (base: Omit<StructureInfoView, "image" | "effects" | "modifiers" | "upkeepBits" | "branch">, image?: string): StructureInfoView => {
    const branch = STRUCTURE_BRANCH_BY_KEY[type];
    return image
      ? { ...base, effects: effectsFor(type), modifiers: modifiersFor(type), upkeepBits: upkeepBitsFor(type), image, ...(branch ? { branch } : {}) }
      : { ...base, effects: effectsFor(type), modifiers: modifiersFor(type), upkeepBits: upkeepBitsFor(type), ...(branch ? { branch } : {}) };
  };
  const imageFor = (key: StructureInfoKey): string | undefined => {
    if (key === "MINTWORKS") return "/overlays/mintworks-overlay.svg";
    if (key === "GRANARY") return "/overlays/incubation-engine-overlay.svg";
    if (key === "CENSUS_HALL") return "/overlays/census-hall-overlay.svg";
    if (key === "OBSERVATORY") return "/overlays/observatory-overlay.svg";
    if (key === "CARAVANARY") return "/overlays/trade-nexus-overlay.svg";
    if (key === "UMBRITE_SYNTHESIZER") return "/overlays/umbrite-synthesizer-overlay.svg";
    if (key === "ADVANCED_UMBRITE_SYNTHESIZER") return "/overlays/advanced-umbrite-synthesizer-overlay.svg";
    if (key === "TITANIUM_WORKS") return "/overlays/titanium-works-overlay.svg";
    if (key === "ADVANCED_TITANIUM_WORKS") return "/overlays/advanced-titanium-works-overlay.svg";
    if (key === "CRYSTAL_SYNTHESIZER") return "/overlays/crystal-synthesizer-overlay.svg";
    if (key === "ADVANCED_CRYSTAL_SYNTHESIZER") return "/overlays/advanced-crystal-synthesizer-overlay.svg";
    if (key === "FOUNDRY") return "/overlays/foundry-overlay.svg";
    if (key === "CUSTOMS_HOUSE") return "/overlays/customs-house-overlay.svg";
    if (key === "CLEARING_HOUSE") return "/overlays/clearing-house-overlay.svg";
    if (key === "GOVERNORS_OFFICE") return "/overlays/governors-office-overlay.svg";
    if (key === "GARRISON_HALL") return "/overlays/ancillary-factory-overlay.svg";
    if (key === "AIRPORT") return "/overlays/airport-overlay.svg";
    if (key === "RADAR_SYSTEM") return "/overlays/radar-system-overlay.svg";
    if (key === "AETHER_TOWER") return "/overlays/ambaric-tower-overlay.svg";
    if (key === "AEGIS_DOME") return "/overlays/aegis-dome-overlay.svg";
    if (key === "ASTRAL_DOCK") return "/overlays/astral-dock-overlay.svg";
    if (key === "RAIL_DEPOT") return "/overlays/rail-depot-overlay.svg";
    if (key === "IMPERIAL_EXCHANGE") return "/overlays/imperial-exchange-overlay.svg";
    if (key === "WORLD_ENGINE") return "/overlays/world-engine-overlay.svg";
    if (key === "QUARTERMASTERS_OFFICE") return "/overlays/quartermasters-office-overlay.svg";
    if (key === "LOGISTICS_GUILD") return "/overlays/logistics-guild-overlay.svg";
    if (key === "ASSEMBLY_WORKS") return "/overlays/assembly-works-overlay.svg";
    if (key === "POPULATION_BUREAU") return "/overlays/population-bureau-overlay.svg";
    if (key === "TITANIUM_LEVY") return "/overlays/titanium-levy-overlay.svg";
    // Each of the 18 monument components gets its own distinct overlay,
    // named after the component (not the monument) since each is a unique
    // structure now, not 3 identical copies of one "Part" icon.
    if (key === "IMPERIAL_EXCHANGE_PART_1") return "/overlays/golden-ledger-overlay.svg";
    if (key === "IMPERIAL_EXCHANGE_PART_2") return "/overlays/counting-engine-overlay.svg";
    if (key === "IMPERIAL_EXCHANGE_PART_3") return "/overlays/sovereign-seal-overlay.svg";
    if (key === "WORLD_ENGINE_PART_1") return "/overlays/long-barrel-overlay.svg";
    if (key === "WORLD_ENGINE_PART_2") return "/overlays/fracture-core-overlay.svg";
    if (key === "WORLD_ENGINE_PART_3") return "/overlays/sky-marking-array-overlay.svg";
    if (key === "AEGIS_DOME_PART_1") return "/overlays/shield-lattice-overlay.svg";
    if (key === "AEGIS_DOME_PART_2") return "/overlays/ward-anchor-overlay.svg";
    if (key === "AEGIS_DOME_PART_3") return "/overlays/aegis-crown-overlay.svg";
    if (key === "ASTRAL_DOCK_PART_1") return "/overlays/launch-cradle-overlay.svg";
    if (key === "ASTRAL_DOCK_PART_2") return "/overlays/orbital-array-overlay.svg";
    if (key === "ASTRAL_DOCK_PART_3") return "/overlays/aether-sail-overlay.svg";
    if (key === "POPULATION_BUREAU_PART_1") return "/overlays/census-engine-overlay.svg";
    if (key === "POPULATION_BUREAU_PART_2") return "/overlays/registry-vault-overlay.svg";
    if (key === "POPULATION_BUREAU_PART_3") return "/overlays/levy-charter-overlay.svg";
    if (key === "TITANIUM_LEVY_PART_1") return "/overlays/muster-klaxon-overlay.svg";
    if (key === "TITANIUM_LEVY_PART_2") return "/overlays/titanium-standard-overlay.svg";
    if (key === "TITANIUM_LEVY_PART_3") return "/overlays/levy-writ-overlay.svg";
    if (key === "WEAPONS_WORKSHOP") return "/overlays/weapons-workshop-overlay.svg";
    if (key === "TITANIUM_WEAPONS_FACTORY") return "/overlays/titanium-weapons-factory-overlay.svg";
    if (key === "UMBRITE_WEAPONS_FACTORY") return "/overlays/umbrite-weapons-factory-overlay.svg";
    return undefined;
  };
  const costBitsFor = (key: StructureInfoKey): string[] => {
    if (key === "TITANIUM_BASTION") return ["1,800 gold", "300 manpower"];
    if (key === "THUNDER_BASTION") return ["4,200 gold", "300 manpower"];
    if (key === "SIEGE_TOWER") return ["1,800 gold", "60 manpower"];
    if (key === "DREAD_TOWER") return ["4,200 gold", "60 manpower"];
    const baseKey = structureBaseKey(key);
    const goldCost = structureCostDefinition(baseKey).baseGoldCost;
    const bits = goldCost > 0 ? [`${goldCost.toLocaleString()} gold`] : [];
    const manpowerCost = structureBuildManpowerCost(baseKey as BuildableStructureType);
    if (manpowerCost > 0) bits.push(`${manpowerCost.toLocaleString()} manpower`);
    return bits;
  };
  if (type === "FORT") {
    return structure({
      title: "Fort",
      detail: "Forts add fortified defense on border or dock tiles. An active fort also stops that origin tile from being counter-taken when your attack fails.",
      glyph: "🛡",
      placement: "Build on a settled border tile or dock you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "TITANIUM_BASTION") {
    return structure({
      title: "Titanium Bastion",
      detail: "Titanium Bastions upgrade standard Forts and raise their defense from 2.5x to 4x while Bastion Walls also adds +10% settled defense.",
      glyph: "🛡",
      placement: "Upgrade an existing Fort on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "THUNDER_BASTION") {
    return structure({
      title: "Thunder Bastion",
      detail: "Thunder Bastions upgrade Titanium Bastions and raise fort defense from 4x to 8x, turning fortified cores into genuine siege problems.",
      glyph: "🛡",
      placement: "Upgrade an existing Titanium Bastion on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "OBSERVATORY") {
    return structure({
      title: "Observatory",
      detail: "Observatories add local vision, protect against hostile crystal actions, and let you cast crystal abilities inside their radius.",
      glyph: "◉",
      placement: "Build on empty settled land only. Not on towns, docks, or resource tiles.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WOODEN_FORT") {
    return structure({
      title: "Palisade",
      detail: "Palisades provide a lighter defensive anchor on border and dock tiles without consuming iron upkeep.",
      glyph: "🪵",
      placement: "Build on an owned border tile or dock with no town, resource, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "FARMSTEAD") {
    return structure({
      title: "Farmstead",
      detail: `Farmsteads add +${TILE_SLOT_BOOST_STRUCTURES.FARMSTEAD} FOOD slot on the tile. Farm tiles only — no effect on fish tiles.`,
      glyph: "🌾",
      placement: "Build on a settled farm resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "UMBRITE_RIG") {
    return structure({
      title: "Umbrite Rig",
      detail: "Umbrite Rigs add +1 UMBRITE slot on the tile.",
      glyph: "🦊",
      placement: "Build on a settled umbrite resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MINE") {
    return structure({
      title: "Mine",
      detail: "Mines add +1 slot of titanium or crystal (whichever this tile produces).",
      glyph: "⛏",
      placement: "Build on a settled titanium or crystal resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MINTWORKS") {
    return structure({
      title: "Mintworks",
      detail: `Mintworks are built on a town support tile. Each grants +10 gold instantly on completion, +1 gold/day, and increases that town's gold production by ${MINTWORKS_PER_MINTWORKS_PERCENT}% (+${MINTWORKS_PER_MINTWORKS_PERCENT_CLEARING_HOUSE}% with an active Clearing House) — multiple Mintworks stack additively.`,
      glyph: "◌",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GRANARY") {
    return structure({
      title: "Incubation Engine",
      detail: "Granaries are built on a town support tile. They strengthen nearby farmsteads within 10 tiles and reduce the supported town's food upkeep.",
      glyph: "🍞",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_HALL") {
    return structure({
      title: "Census Hall",
      detail: "Census Halls are built on a town support tile. They add +25% local population growth.",
      glyph: "⌘",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CLEARING_HOUSE") {
    return structure({
      title: "Clearing House",
      detail: `Clearing Houses are built on a town support tile. One active clearing house raises the gold bonus of every Mintworks in this town and its directly connected towns from +${MINTWORKS_PER_MINTWORKS_PERCENT}% to +${MINTWORKS_PER_MINTWORKS_PERCENT_CLEARING_HOUSE}% per copy.`,
      glyph: "⌂",
      placement: "Build on an open settled support tile for a town with a connected city network.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CARAVANARY") {
    return structure({
      title: "Trade Nexus",
      detail: "Trade Nexuses are built on a town support tile. Towns only get a road connection (and its income bonus) to each other if at least one town in the network has a Trade Nexus.",
      glyph: "⚖",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  {
    const converterInfo = converterStructureInfoView(type, structure, imageFor, costBitsFor, buildTimeLabelFor);
    if (converterInfo) return converterInfo;
  }
  if (type === "RELAY_BEACON") {
    return structure({
      title: "Relay Beacon",
      detail: "Relay Beacons are cheap border structures that extend vision and keep the 5 gold / m upkeep, without the Siege Outpost +25% offense profile.",
      glyph: "⚑",
      placement: "Build on an owned border tile with no town, resource, dock, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "SIEGE_TOWER") {
    return structure({
      title: "Siege Tower",
      detail: "Siege Towers upgrade Siege Outposts and raise their attack from 1.6x to 1.8x.",
      glyph: "⚔",
      placement: "Upgrade an existing Siege Outpost on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "DREAD_TOWER") {
    return structure({
      title: "Dread Tower",
      detail: "Dread Towers upgrade Siege Towers and raise siege attack from 1.8x to 2.0x for assaults against the heaviest fortified targets.",
      glyph: "⚔",
      placement: "Upgrade an existing Siege Tower on its current tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "FOUNDRY") {
    return structure({
      title: "Foundry",
      detail: "Foundries double active Mine slot output within 5 tiles.",
      glyph: "🏭",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CUSTOMS_HOUSE") {
    return structure({
      title: "Harbor Exchange",
      detail: "Harbor exchanges are built beside a dock and add +5 gold per day for each connected owned dock.",
      glyph: "⚓",
      placement: "Build on a settled dock tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASTRAL_DOCK_PART_1") {
    return structure({
      title: "Launch Cradle",
      detail: "The Launch Cradle is the first of the Astral Dock's 3 required components — a curved berth structure that will eventually hold the finished satellite before launch.",
      glyph: "🚀",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASTRAL_DOCK_PART_2") {
    return structure({
      title: "Orbital Array",
      detail: "The Orbital Array is one of the Astral Dock's 3 required components — a mast-mounted dish for tracking the satellite once it's aloft.",
      glyph: "🛰",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASTRAL_DOCK_PART_3") {
    return structure({
      title: "Aether Sail",
      detail: "The Aether Sail is one of the Astral Dock's 3 required components — a crystal-threaded sail panel that catches aether currents for the satellite's flight.",
      glyph: "⛵",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASTRAL_DOCK") {
    return structure({
      title: "Astral Dock",
      detail: "The Astral Dock is a unique world monument. Placing it consumes all 3 Astral Dock Parts. Once assembled and powered, it can launch one satellite, free, that reveals the full map for 24 hours.",
      glyph: "✶",
      placement: "Place on any settled tile you own after finishing 3 Astral Dock Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RAIL_DEPOT") {
    return structure({
      title: "Rail Depot",
      detail: "Rail Depots are mustering hubs that amplify every Logistics Guild in this connected-town network (+0.1 manpower/min each) and speed up outpost muster within 50 tiles. Only one Rail Depot is allowed per connected-town network.",
      glyph: "🚉",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WATERWORKS") {
    return structure({
      title: "Waterworks",
      detail: `A network of irrigation canals. Every Farmstead within a 10-tile radius gains +${WATERWORKS_FARMSTEAD_FOOD_SLOT_BONUS} FOOD slots.`,
      glyph: "💧",
      placement: "Build on any settled land tile. Does not need a resource tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GOVERNORS_OFFICE") {
    return structure({
      title: "Ministry Hall",
      detail: "Ministry halls reduce a nearby town's FOOD slot demand by its own tier step (e.g. -1 for City, -2 for Great City) within 10 tiles.",
      glyph: "🏛",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "GARRISON_HALL") {
    return structure({
      title: "Ancillary Factory",
      detail: "Ancillary Factories add +150 manpower cap to this town, plus +300 manpower cap if an Assembly Works is in this town's connected network.",
      glyph: "🪖",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WEAPONS_WORKSHOP") {
    return structure({
      title: "Weapons Workshop",
      detail: "Weapons Workshops forge Titanium and Umbrite into titanium-alloy plating and charged energy blades, granting a small empire-wide attack and defense boost. Unlike most buildings, there's no per-town limit — build many in one town to raise a dedicated military city.",
      glyph: "🗡",
      placement: "Build on an open settled support tile for a town you own. No per-town limit.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_WEAPONS_FACTORY") {
    return structure({
      title: "Titanium Weapons Factory",
      detail: "Titanium Weapons Factories forge armor plating from Titanium — armor doctrine: +1.5% attack / +3% defense per copy, empire-wide (like Weapons Workshop). No per-town limit, but each additional copy costs more manpower than the last. Owning zero Titanium or zero Umbrite Weapons Factories anywhere leaves your whole empire far easier to attack.",
      glyph: "🛡",
      placement: "Build on an open settled support tile for a town you own. No per-town limit.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "UMBRITE_WEAPONS_FACTORY") {
    return structure({
      title: "Umbrite Weapons Factory",
      detail: "Umbrite Weapons Factories outfit raiders from Umbrite — raiding doctrine: +3% attack / +1.5% defense per copy, empire-wide (like Weapons Workshop). No per-town limit, but each additional copy costs more manpower than the last. Owning zero Umbrite or zero Titanium Weapons Factories anywhere leaves your whole empire far easier to attack.",
      glyph: "🗡",
      placement: "Build on an open settled support tile for a town you own. No per-town limit.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AIRPORT") {
    return structure({
      title: "Aetherport",
      detail: "Aetherports strip enemy ownership from a 3×3 area within 30 tiles (structures survive). Free to fire, with a 20-minute cooldown. Each tile has a 15% base miss chance, rising to 40% near forts. Blocked by Resonance Grids. Requires Ambaric Tower power.",
      glyph: "✈",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AETHER_TOWER") {
    return structure({
      title: "Ambaric Tower",
      detail: "Ambaric Towers create a 30-tile power radius for late-game sky and monument structures. Chain them across your empire to keep advanced systems online.",
      glyph: "⚡",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RADAR_SYSTEM") {
    return structure({
      title: "Resonance Grid",
      detail: "Resonance Grids block enemy sky bombardment within 30 tiles and reveal the origin. They require Ambaric Tower power.",
      glyph: "📡",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE_PART_1") {
    return structure({
      title: "Golden Ledger",
      detail: "The Golden Ledger is one of the Imperial Exchange's 3 required components — a brass-bound account book that will record every levy the finished Exchange ever collects.",
      glyph: "📖",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE_PART_2") {
    return structure({
      title: "Counting Engine",
      detail: "The Counting Engine is one of the Imperial Exchange's 3 required components — a mechanical tallying drum for reconciling rival treasuries at a glance.",
      glyph: "🧮",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE_PART_3") {
    return structure({
      title: "Sovereign Seal",
      detail: "The Sovereign Seal is one of the Imperial Exchange's 3 required components — the stamp of authority the finished Exchange will use to make a levy official.",
      glyph: "🔏",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WORLD_ENGINE_PART_1") {
    return structure({
      title: "The Long Barrel",
      detail: "The Long Barrel is one of the Worldbreaker Cannon's 3 required components — the tapered iron barrel the finished cannon will fire through.",
      glyph: "🎯",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WORLD_ENGINE_PART_2") {
    return structure({
      title: "Fracture Core",
      detail: "The Fracture Core is one of the Worldbreaker Cannon's 3 required components — the crystalline heart that powers each Worldbreaker shot.",
      glyph: "💥",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WORLD_ENGINE_PART_3") {
    return structure({
      title: "Sky-Marking Array",
      detail: "The Sky-Marking Array is one of the Worldbreaker Cannon's 3 required components — the targeting rig the finished cannon will sight its shots through.",
      glyph: "🔭",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE") {
    return structure({
      title: "Imperial Exchange",
      detail: "Unique world monument. Once the three parts are complete, place it on any settled tile you own — this consumes all 3 Imperial Exchange Parts — and, once every 24 hours, levy 100% of a single chosen rival's gold.",
      glyph: "✶",
      placement: "Place on any settled tile you own after finishing 3 Imperial Exchange Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WORLD_ENGINE") {
    return structure({
      title: "Worldbreaker Cannon",
      detail: "Unique world monument. Once the three parts are complete, place it on any settled tile you own — this consumes all 3 Worldbreaker Cannon Parts — and fire one Worldbreaker shot every 10 minutes that destroys an enemy structure and cuts that town's population by 30%, for 1,000 gold.",
      glyph: "✸",
      placement: "Place on any settled tile you own after finishing 3 Worldbreaker Cannon Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AEGIS_DOME_PART_1") {
    return structure({
      title: "Shield Lattice",
      detail: "The Shield Lattice is one of the Aegis Dome's 3 required components — a hexagonal grid-panel fragment of the dome's eventual shield.",
      glyph: "🛡",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AEGIS_DOME_PART_2") {
    return structure({
      title: "Ward Anchor",
      detail: "The Ward Anchor is one of the Aegis Dome's 3 required components — a grounding spike that will anchor the finished dome's protective field.",
      glyph: "⚓",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AEGIS_DOME_PART_3") {
    return structure({
      title: "Aegis Crown",
      detail: "The Aegis Crown is one of the Aegis Dome's 3 required components — the crest that will cap the finished dome and trigger its Aegis Lock.",
      glyph: "👑",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AEGIS_DOME") {
    return structure({
      title: "Aegis Dome",
      detail: "Unique world monument. Once the three parts are complete, place it on any settled tile you own — this consumes all 3 Aegis Dome Parts — to shield a 25-tile core and trigger a free 15-minute Aegis Lock every 60 minutes.",
      glyph: "⬡",
      placement: "Place on any settled tile you own after finishing 3 Aegis Dome Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "QUARTERMASTERS_OFFICE") {
    return structure({
      title: "Quartermaster's Office",
      detail: "Quartermaster's Offices reduce the manpower cost by 33% for War-branch structures (Fort/Siege ladders) built within 20 tiles. Does not stack with other Quartermaster's Offices.",
      glyph: "🎖",
      placement: "Build on settled land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "LOGISTICS_GUILD") {
    return structure({
      title: "Logistics Guild",
      detail: "Logistics Guilds add +0.05 manpower/min empire-wide, standalone. A Rail Depot in this town's connected network amplifies each one to +0.1/min.",
      glyph: "📦",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ASSEMBLY_WORKS") {
    return structure({
      title: "Assembly Works",
      detail: "Assembly Works amplify every Ancillary Factory in this connected-town network, adding +300 manpower cap to each. Only one Assembly Works is allowed per connected-town network.",
      glyph: "🏗",
      placement: "Build on an open settled support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "POPULATION_BUREAU_PART_1") {
    return structure({
      title: "Census Engine",
      detail: "The Census Engine is one of the Population Bureau's 3 required components — a rotary card-index drum for tracking every counted citizen.",
      glyph: "📋",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "POPULATION_BUREAU_PART_2") {
    return structure({
      title: "Registry Vault",
      detail: "The Registry Vault is one of the Population Bureau's 3 required components — a strongbox for the empire's population records.",
      glyph: "🗄",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "POPULATION_BUREAU_PART_3") {
    return structure({
      title: "Levy Charter",
      detail: "The Levy Charter is one of the Population Bureau's 3 required components — the founding writ that will authorize the finished Bureau's manpower bonus.",
      glyph: "📜",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "POPULATION_BUREAU") {
    return structure({
      title: "Population Bureau",
      detail: "Unique world monument. Once the three parts are complete, place it on any settled tile you own — this consumes all 3 Population Bureau Parts — to add +0.1 manpower/min empire-wide for every Manpower-branch building you own.",
      glyph: "◈",
      placement: "Place on any settled tile you own after finishing 3 Population Bureau Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_LEVY_PART_1") {
    return structure({
      title: "Muster Klaxon",
      detail: "The Muster Klaxon is one of The Titanium Levy's 3 required components — the steam-horn that will sound the call to arms.",
      glyph: "📢",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_LEVY_PART_2") {
    return structure({
      title: "Titanium Standard",
      detail: "The Titanium Standard is one of The Titanium Levy's 3 required components — the battle-standard the finished monument's muster will rally behind.",
      glyph: "🚩",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_LEVY_PART_3") {
    return structure({
      title: "Levy Writ",
      detail: "The Levy Writ is one of The Titanium Levy's 3 required components — the conscription order that will authorize the finished monument's one-time army.",
      glyph: "📃",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_LEVY") {
    return structure({
      title: "The Titanium Levy",
      detail: "Unique world monument. Once the three parts are complete, place it on any settled tile you own — this consumes all 3 Titanium Levy Parts — to convert 50% of your currently-banked manpower into an instant one-time army, then freeze empire-wide manpower regen for 2 hours. Requires nearby Ambaric Tower power.",
      glyph: "⬢",
      placement: "Place on any settled tile you own after finishing 3 Titanium Levy Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  return structure({
    title: "Siege Outpost",
    detail: "Siege outposts are offensive staging structures for border tiles. They add +60% local offense to attacks launched from their tile.",
    glyph: "⚔",
    placement: "Build on a settled border tile you own.",
    costBits: costBitsFor(type),
    buildTimeLabel: buildTimeLabelFor(type)
  });
};

export const structureInfoButtonHtml = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string },
  label?: string
): string => `<button class="inline-info-link" type="button" data-structure-info="${type}">${label ?? structureInfoForKey(type, deps).title}</button>`;

export const resourceColor = (resource: string | undefined): string | undefined => {
  if (resource === "FARM") return "#e9f27b";
  if (resource === "FISH") return "#6ec9ff";
  if (resource === "UMBRITE") return "#4d2a86";
  if (resource === "TITANIUM") return "#c9c9c9";
  if (resource === "GEMS") return "#b175ff";
  return undefined;
};

export const resourceLabel = (resource: string | undefined): string => {
  if (resource === "FARM") return "GRAIN";
  if (resource === "UMBRITE") return "UMBRITE";
  if (resource === "FISH") return "FISH";
  if (resource === "TITANIUM") return "TITANIUM";
  if (resource === "GEMS") return "GEMS";
  return resource ?? "";
};

export const resourceIconForKey = (resource: string): string => {
  if (resource === "GOLD") return "◉";
  if (resource === "FOOD") return "🍞";
  if (resource === "TITANIUM") return "⛏";
  if (resource === "CRYSTAL") return "💎";
  if (resource === "UMBRITE") return "🟣";
  if (resource === "SHARD") return "✦";
  return "•";
};

export const strategicResourceKeyForTile = (tile: Tile): "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | undefined => {
  if (tile.resource === "FARM" || tile.resource === "FISH") return "FOOD";
  if (tile.resource === "TITANIUM") return "TITANIUM";
  if (tile.resource === "GEMS") return "CRYSTAL";
  if (tile.resource === "UMBRITE") return "UMBRITE";
  return undefined;
};

export const tileProductionHtml = (tile: Tile): string => {
  const prodStrategic = Object.entries(tile.yieldRate?.strategicPerDay ?? {})
    .filter(([, value]) => Number(value) > 0)
    .map(([resource, value]) => `${resourceIconForKey(resource)} ${Number(value).toFixed(1)}/day`);
  const gpd = (tile.yieldRate?.goldPerMinute ?? 0) * 1440;
  const parts: string[] = [];
  if (tile.town || gpd > 0) parts.push(`${resourceIconForKey("GOLD")} ${gpd.toFixed(1)}/day`);
  parts.push(...prodStrategic);
  return parts.join(" · ");
};

export const tileUpkeepHtml = (tile: Tile): string => {
  const upkeepFromEntries = { food: 0, titanium: 0, umbrite: 0, crystal: 0, gold: 0 };
  for (const entry of tile.upkeepEntries ?? []) {
    upkeepFromEntries.food += Number(entry.perMinute.FOOD ?? 0);
    upkeepFromEntries.titanium += Number(entry.perMinute.TITANIUM ?? 0);
    upkeepFromEntries.umbrite += Number(entry.perMinute.UMBRITE ?? 0);
    upkeepFromEntries.crystal += Number(entry.perMinute.CRYSTAL ?? 0);
    upkeepFromEntries.gold += Number(entry.perMinute.GOLD ?? 0);
  }
  const parts: string[] = [];
  if (upkeepFromEntries.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${(upkeepFromEntries.food * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.titanium > 0.001) parts.push(`${resourceIconForKey("TITANIUM")} ${(upkeepFromEntries.titanium * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.umbrite > 0.001) parts.push(`${resourceIconForKey("UMBRITE")} ${(upkeepFromEntries.umbrite * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${(upkeepFromEntries.crystal * 1440).toFixed(1)}/day`);
  if (upkeepFromEntries.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${(upkeepFromEntries.gold * 1440).toFixed(1)}/day`);
  if (parts.length > 0) return parts.join(" · ");
  if (tile.town && typeof tile.town.foodUpkeepPerMinute === "number") parts.push(`${resourceIconForKey("FOOD")} ${(tile.town.foodUpkeepPerMinute * 1440).toFixed(1)}/day`);
  if (tile.observatory?.status === "active") parts.push(`${resourceIconForKey("CRYSTAL")} ${(OBSERVATORY_UPKEEP_PER_MIN * 1440).toFixed(1)}/day`);
  return parts.join(" · ");
};

export const storedYieldSummary = (tile: Tile, options?: { alwaysShowOwnedTownGold?: boolean }): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = tile.yieldCap?.gold ?? 0;
  const canStoreGold = Boolean(tile.town || tile.dockId || (tile.yieldRate?.goldPerMinute ?? 0) > 0.01 || gold > 0.01);
  const alwaysShowOwnedTownGold = options?.alwaysShowOwnedTownGold === true;
  if (canStoreGold && (gold > 0.01 || goldCap > 0 || alwaysShowOwnedTownGold)) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${goldCap.toFixed(0)}`);
  }
  const strategicCap = tile.yieldCap?.strategicEach ?? 0;
  const strategicEntries = new Map<string, number>(
    Object.entries(tile.yield?.strategic ?? {}).map(([resource, value]) => [resource, Number(value)])
  );
  const primaryStrategic = strategicResourceKeyForTile(tile);
  if (primaryStrategic && strategicCap > 0 && !strategicEntries.has(primaryStrategic)) strategicEntries.set(primaryStrategic, 0);
  for (const [resource, value] of strategicEntries) {
    if (Number(value) <= 0.01 && strategicCap <= 0) continue;
    parts.push(`${resourceIconForKey(resource)} ${Number(value).toFixed(2)} / ${strategicCap.toFixed(1)}`);
  }
  return parts.join(" · ");
};

const yieldCapForResource = (tile: Tile, resource: string): number | undefined => {
  if (!tile.yieldCap) return undefined;
  if (resource === "GOLD") return tile.yieldCap.gold;
  if (resource === "FOOD" || resource === "TITANIUM" || resource === "CRYSTAL" || resource === "UMBRITE" || resource === "SHARD") {
    return tile.yieldCap.strategicEach;
  }
  return undefined;
};

export const formatYieldSummary = (tile: Tile): string => {
  const parts: string[] = [];
  const gold = tile.yield?.gold ?? 0;
  const goldCap = yieldCapForResource(tile, "GOLD");
  if (gold > 0.01 || (goldCap ?? 0) > 0) {
    parts.push(`${resourceIconForKey("GOLD")} ${gold.toFixed(1)} / ${(goldCap ?? 0).toFixed(1)}`);
  }
  for (const key of ["FOOD", "TITANIUM", "CRYSTAL", "UMBRITE", "SHARD"] as const) {
    const amount = Number(tile.yield?.strategic?.[key] ?? 0);
    const cap = yieldCapForResource(tile, key);
    if (amount <= 0.01 && (cap ?? 0) <= 0) continue;
    parts.push(`${resourceIconForKey(key)} ${amount.toFixed(1)} / ${(cap ?? 0).toFixed(1)}`);
  }
  return parts.length > 0 ? `Yield: ${parts.join("  ")}` : "";
};

export const formatUpkeepSummary = (upkeep: { food: number; titanium: number; umbrite: number; crystal: number; gold: number }): string => {
  const parts: string[] = [];
  if (upkeep.food > 0.001) parts.push(`${resourceIconForKey("FOOD")} ${(upkeep.food * 1440).toFixed(1)}/day`);
  if (upkeep.titanium > 0.001) parts.push(`${resourceIconForKey("TITANIUM")} ${(upkeep.titanium * 1440).toFixed(1)}/day`);
  if (upkeep.umbrite > 0.001) parts.push(`${resourceIconForKey("UMBRITE")} ${(upkeep.umbrite * 1440).toFixed(1)}/day`);
  if (upkeep.crystal > 0.001) parts.push(`${resourceIconForKey("CRYSTAL")} ${(upkeep.crystal * 1440).toFixed(1)}/day`);
  if (upkeep.gold > 0.001) parts.push(`${resourceIconForKey("GOLD")} ${(upkeep.gold * 1440).toFixed(1)}/day`);
  return parts.length > 0 ? `Empire upkeep: ${parts.join("  ")}` : "";
};
