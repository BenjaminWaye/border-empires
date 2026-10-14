import {
  TILE_SLOT_BOOST_STRUCTURES, HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS,
  economicStructureBuildDurationMs, type SlotStructureType
} from "@border-empires/shared";
import { structureInfoBuildMs, type BuildSpeedState } from "./client-structure-time-labels/client-structure-time-labels.js";
import {
  mintworksGoldProductionMultiplier, structureModifiersFor, type ModifierStructureType, type StructureModifier
} from "@border-empires/game-domain";
import type { Tile } from "./client-types.js";
import { resourceIconGlyph, resourceIconHtml } from "./client-resource-icons/client-resource-icons.js";
import { converterStructureInfoView } from "./client-converter-structure-info.js";
import { structureInfoArtUrl } from "./client-structure-art/client-structure-art.js";
import { costBitsFor, structureBaseKey } from "./client-structure-cost-bits.js";
import { upkeepDescriptorFor } from "./client-structure-upkeep-text/client-structure-upkeep-text.js";

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
  | "HYDROGARDEN"
  | "HYDROWORKS"
  | "UMBRITE_RIG"
  | "MINE"
  | "MINTWORKS"
  | "INCUBATION_ENGINE"
  | "CENSUS_HALL"
  | "CLEARING_HOUSE"
  | "TRADE_NEXUS"
  | "PALISADE"
  | "RELAY_BEACON"
  | "UMBRITE_WORKS"
  | "HIGH_YIELD_UMBRITE_WORKS"
  | "TITANIUM_WORKS"
  | "HIGH_YIELD_TITANIUM_WORKS"
  | "AETHER_CONDENSER"
  | "HIGH_YIELD_AETHER_CONDENSER"
  | "ORE_REFINERY"
  | "HARBOR_EXCHANGE"
  | "MINISTRY_HALL"
  | "ANCILLARY_DEPOT"
  | "SKY_DOCK"
  | "AMBARIC_TRANSFORMER"
  | "RESONANCE_GRID"
  | "QUARTERMASTERS_OFFICE"
  | "ANCILLARY_FACTORY"
  | "RESERVE_LATTICE"
  | "ASTRAL_DOCK_PART_1"
  | "ASTRAL_DOCK_PART_2"
  | "ASTRAL_DOCK_PART_3"
  | "ASTRAL_DOCK"
  | "NEURAL_WORKS"
  | "IMPERIAL_EXCHANGE_PART_1"
  | "IMPERIAL_EXCHANGE_PART_2"
  | "IMPERIAL_EXCHANGE_PART_3"
  | "SOVEREIGN_SIEGE_ENGINE_PART_1"
  | "SOVEREIGN_SIEGE_ENGINE_PART_2"
  | "SOVEREIGN_SIEGE_ENGINE_PART_3"
  | "IMPERIAL_EXCHANGE"
  | "SOVEREIGN_SIEGE_ENGINE"
  | "AEGIS_DOME_PART_1"
  | "AEGIS_DOME_PART_2"
  | "AEGIS_DOME_PART_3"
  | "AEGIS_DOME"
  | "CENSUS_DIRECTORATE_PART_1"
  | "CENSUS_DIRECTORATE_PART_2"
  | "CENSUS_DIRECTORATE_PART_3"
  | "CENSUS_DIRECTORATE"
  | "TITANIUM_LEVY_PART_1"
  | "TITANIUM_LEVY_PART_2"
  | "TITANIUM_LEVY_PART_3"
  | "TITANIUM_LEVY"
  | "SIEGE_BATTERY"
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
  // (e.g. "Blocked by Resonance Grids", "Requires nearby Ambaric Transformer
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
  "SOVEREIGN_SIEGE_ENGINE_PART_1", "SOVEREIGN_SIEGE_ENGINE_PART_2", "SOVEREIGN_SIEGE_ENGINE_PART_3",
  "AEGIS_DOME_PART_1", "AEGIS_DOME_PART_2", "AEGIS_DOME_PART_3",
  "ASTRAL_DOCK_PART_1", "ASTRAL_DOCK_PART_2", "ASTRAL_DOCK_PART_3",
  "CENSUS_DIRECTORATE_PART_1", "CENSUS_DIRECTORATE_PART_2", "CENSUS_DIRECTORATE_PART_3",
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
  SOVEREIGN_SIEGE_ENGINE: [
    { type: "SOVEREIGN_SIEGE_ENGINE_PART_1", name: "The Long Barrel" },
    { type: "SOVEREIGN_SIEGE_ENGINE_PART_2", name: "Fracture Core" },
    { type: "SOVEREIGN_SIEGE_ENGINE_PART_3", name: "Sky-Marking Array" }
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
  CENSUS_DIRECTORATE: [
    { type: "CENSUS_DIRECTORATE_PART_1", name: "Census Engine" },
    { type: "CENSUS_DIRECTORATE_PART_2", name: "Registry Vault" },
    { type: "CENSUS_DIRECTORATE_PART_3", name: "Levy Charter" }
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
  SIEGE_BATTERY: "War", SIEGE_TOWER: "War", DREAD_TOWER: "War",
  WEAPONS_WORKSHOP: "War",
  TITANIUM_WEAPONS_FACTORY: "War", UMBRITE_WEAPONS_FACTORY: "War",
  HYDROGARDEN: "Economy", HYDROWORKS: "Economy", MINE: "Economy",
  MINTWORKS: "Economy", CLEARING_HOUSE: "Economy",
  UMBRITE_WORKS: "Economy", HIGH_YIELD_UMBRITE_WORKS: "Economy",
  TITANIUM_WORKS: "Economy", HIGH_YIELD_TITANIUM_WORKS: "Economy",
  ORE_REFINERY: "Economy", HARBOR_EXCHANGE: "Economy",
  TRADE_NEXUS: "Economy", MINISTRY_HALL: "Economy",
  IMPERIAL_EXCHANGE_PART_1: "Economy", IMPERIAL_EXCHANGE_PART_2: "Economy", IMPERIAL_EXCHANGE_PART_3: "Economy", IMPERIAL_EXCHANGE: "Economy",
  UMBRITE_RIG: "War",
  INCUBATION_ENGINE: "Manpower", CENSUS_HALL: "Manpower",
  ANCILLARY_DEPOT: "Manpower", NEURAL_WORKS: "Manpower",
  QUARTERMASTERS_OFFICE: "Manpower", ANCILLARY_FACTORY: "Manpower",
  RESERVE_LATTICE: "Manpower",
  CENSUS_DIRECTORATE_PART_1: "Manpower", CENSUS_DIRECTORATE_PART_2: "Manpower", CENSUS_DIRECTORATE_PART_3: "Manpower", CENSUS_DIRECTORATE: "Manpower",
  TITANIUM_LEVY_PART_1: "Manpower", TITANIUM_LEVY_PART_2: "Manpower", TITANIUM_LEVY_PART_3: "Manpower", TITANIUM_LEVY: "Manpower",
  OBSERVATORY: "Aether", AETHER_CONDENSER: "Aether",
  HIGH_YIELD_AETHER_CONDENSER: "Aether", SKY_DOCK: "Aether",
  AMBARIC_TRANSFORMER: "Aether", RESONANCE_GRID: "Aether",
  ASTRAL_DOCK_PART_1: "Aether", ASTRAL_DOCK_PART_2: "Aether", ASTRAL_DOCK_PART_3: "Aether", ASTRAL_DOCK: "Aether",
  AEGIS_DOME_PART_1: "War", AEGIS_DOME_PART_2: "War", AEGIS_DOME_PART_3: "War", AEGIS_DOME: "War",
  SOVEREIGN_SIEGE_ENGINE_PART_1: "War", SOVEREIGN_SIEGE_ENGINE_PART_2: "War", SOVEREIGN_SIEGE_ENGINE_PART_3: "War", SOVEREIGN_SIEGE_ENGINE: "War"
};

// Structure display names live in their own module (single source of truth,
// consumed by tech-unlock chips, tech-effect blurbs, tile overview
// modifiers, and build-action labels) — re-exported here since this is the
// module every existing importer of economicStructureName already uses.
export { STRUCTURE_DISPLAY_NAMES, economicStructureName } from "./client-structure-display-names.js";

export const economicStructureBuildMs = (type: EconomicStructureType): number => {
  return economicStructureBuildDurationMs(type);
};

export const structureInfoForKey = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string; ownedCountOfType?: number | undefined; buildSpeedState?: BuildSpeedState | undefined }
): StructureInfoView => {
  const buildTimeLabelFor = (key: StructureInfoKey): string =>
    deps.formatCooldownShort(structureInfoBuildMs(key, deps.ownedCountOfType ?? 0, deps.buildSpeedState));
  // Single shared source of truth for "what does this cost to keep running"
  // (client-structure-upkeep-text.ts) -- also used by the build-menu action
  // list and the dormant-structure warning line, so all three can never
  // disagree the way this modal's own copy of the formula used to.
  const upkeepBitsFor = (key: StructureInfoKey): string[] => {
    const baseKey = structureBaseKey(key);
    const slotKey: SlotStructureType =
      key === "TITANIUM_BASTION" || key === "THUNDER_BASTION" || key === "SIEGE_TOWER" || key === "DREAD_TOWER"
        ? key
        : (baseKey as SlotStructureType);
    return upkeepDescriptorFor(slotKey, deps.ownedCountOfType);
  };
  // Numeric effects now live in `modifiers` (structureModifiersFor, below) —
  // this list is only for qualitative bullets that don't reduce to a
  // Modifier line (mechanic descriptions, "requires power", limits, etc).
  const effectsFor = (key: StructureInfoKey): string[] => {
    if (key === "FORT") return ["Prevents failed attacks from immediately flipping the fortified origin tile"];
    if (key === "TITANIUM_BASTION") return ["Upgrades Forts into Titanium Bastions", "Also keeps the +10% garrisoned defense from Bastion Walls"];
    if (key === "THUNDER_BASTION") return ["Upgrades Titanium Bastions into Thunder Bastions", "Improves resistance to siege and lance pressure"];
    if (key === "OBSERVATORY") return ["Crystal range grows with tech"];
    if (key === "PALISADE") return ["Light defensive fortification", "No iron upkeep"];
    if (key === "RELAY_BEACON") return ["Cheap offensive staging point", "Faster, weaker alternative to a Siege Battery"];
    if (key === "SIEGE_BATTERY") return ["Improves attacks launched from this tile"];
    if (key === "SIEGE_TOWER") return ["Upgrades Siege Batteries into Siege Towers"];
    if (key === "DREAD_TOWER") return ["Upgrades Siege Towers into Dread Towers, effective against heavy fortified targets"];
    if (key === "HYDROGARDEN") return ["Grain resource tiles only — no effect on fish tiles"];
    if (key === "HYDROWORKS") return [];
    if (key === "UMBRITE_RIG") return [];
    if (key === "MINE") return [];
    if (key === "MINTWORKS") return ["Stacks additively across every active Mintworks in the town"];
    if (key === "INCUBATION_ENGINE") return [];
    if (key === "CENSUS_HALL") return [];
    if (key === "CLEARING_HOUSE") return [];
    if (key === "TRADE_NEXUS") return ["Enables the connected-town income bonus for this road network"];
    if (key === "UMBRITE_WORKS" || key === "HIGH_YIELD_UMBRITE_WORKS") return ["Sell off: 1 umbrite slot → coin"];
    if (key === "TITANIUM_WORKS" || key === "HIGH_YIELD_TITANIUM_WORKS") return ["Sell off: 1 titanium slot → coin"];
    if (key === "AETHER_CONDENSER" || key === "HIGH_YIELD_AETHER_CONDENSER") return ["Sell off: 1 crystal slot → coin"];
    if (key === "ORE_REFINERY") return [];
    if (key === "HARBOR_EXCHANGE") return [];
    if (key === "MINISTRY_HALL") return [];
    if (key === "ANCILLARY_DEPOT") return ["Also boosts manpower cap further if a Reserve Lattice is in this town's connected network"];
    if (key === "SKY_DOCK") return ["Strips ownership from a 3×3 area (structures survive)", "Free • 20m cooldown", "Blocked by Resonance Grids", "Requires nearby Ambaric Transformer power"];
    if (key === "AMBARIC_TRANSFORMER") return ["Powers nearby Sky Docks, Resonance Grids, and monuments", "Can chain power through other Ambaric Transformers"];
    if (key === "RESONANCE_GRID") return ["Requires nearby Ambaric Transformer power"];
    if (key === "QUARTERMASTERS_OFFICE") return ["Does not stack with other Quartermaster's Offices"];
    if (key === "ANCILLARY_FACTORY") return ["Boosted rate applies instead of the standalone rate when a Neural Works is in this town's connected network"];
    if (key === "RESERVE_LATTICE") return ["One per connected-town network"];
    if (MONUMENT_COMPONENT_KEYS.has(key)) return ["One of the monument's 3 required unique components", "Must be built in a Great City or Monumental City that has no other monument component"];
    if (key === "ASTRAL_DOCK") return ["Unique world monument", "Must wait for the current satellite to come down before relaunching", "Requires nearby Ambaric Transformer power"];
    if (key === "NEURAL_WORKS") return ["Boosts outpost muster speed within 50 tiles", "One per connected-town network"];
    if (key === "IMPERIAL_EXCHANGE") return ["Unique world monument", "Free", "Requires nearby Ambaric Transformer power"];
    if (key === "AEGIS_DOME") return ["Unique world monument", "Aegis Lock prevents hostile ownership changes in that radius, free", "Requires nearby Ambaric Transformer power"];
    if (key === "SOVEREIGN_SIEGE_ENGINE") return ["Unique world monument", "Every 10 minutes, anywhere on the map", "Requires nearby Ambaric Transformer power"];
    if (key === "CENSUS_DIRECTORATE") return ["Unique world monument"];
    if (key === "TITANIUM_LEVY") return ["Unique world monument", "Freezes empire-wide manpower regen afterward", "Requires nearby Ambaric Transformer power"];
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
  const imageFor = (key: StructureInfoKey): string | undefined => structureInfoArtUrl(key);
  if (type === "FORT") {
    return structure({
      title: "Fort",
      detail: "Forts add fortified defense on border or dock tiles. An active fort also stops that origin tile from being counter-taken when your attack fails.",
      glyph: "🛡",
      placement: "Build on a garrisoned border tile or dock you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "TITANIUM_BASTION") {
    return structure({
      title: "Titanium Bastion",
      detail: "Titanium Bastions upgrade standard Forts and raise their defense from 2.5x to 4x while Bastion Walls also adds +10% garrisoned defense.",
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
      title: "Aether Tower",
      detail: "Aether Towers add local vision, protect your own nearby tiles (never unclaimed or other players' land) against hostile Aether abilities, and let you cast crystal abilities inside their radius.",
      glyph: "◉",
      placement: "Build on empty garrisoned land only. Not on towns, docks, or resource tiles.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "PALISADE") {
    return structure({
      title: "Palisade",
      detail: "Palisades provide a lighter defensive anchor on border and dock tiles without consuming iron upkeep.",
      glyph: "🪵",
      placement: "Build on a garrisoned tile you own. Like a Fort, it can share its tile with a Relay Beacon or Harbor Exchange.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "HYDROGARDEN") {
    return structure({
      title: "Hydrogarden",
      detail: `Hydrogardens add +${TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN} FOOD slots on grain resource tiles. No effect on fish tiles.`,
      glyph: "🌾",
      placement: "Build on a garrisoned farm resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "UMBRITE_RIG") {
    return structure({
      title: "Umbrite Rig",
      detail: "Umbrite Rigs add +1 UMBRITE slot on the tile.",
      glyph: "🦊",
      placement: "Build on a garrisoned umbrite resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MINE") {
    return structure({
      title: "Mine",
      detail: "Mines add +1 slot of titanium or crystal (whichever this tile produces).",
      glyph: "⛏",
      placement: "Build on a garrisoned titanium or crystal resource tile you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "MINTWORKS") {
    return structure({
      title: "Mintworks",
      detail: `Mintworks are built on a town support tile. Each grants +10 coin instantly on completion, +1 coin/day, and increases that town's coin production by ${MINTWORKS_PER_MINTWORKS_PERCENT}% (+${MINTWORKS_PER_MINTWORKS_PERCENT_CLEARING_HOUSE}% with an active Clearing House) — multiple Mintworks stack additively.`,
      glyph: "◌",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "INCUBATION_ENGINE") {
    return structure({
      title: "Incubation Engine",
      detail: "Incubation Engines are built on a town support tile. They strengthen nearby Hydrogardens within 10 tiles and reduce the supported town's food upkeep.",
      glyph: "🍞",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_HALL") {
    return structure({
      title: "Census Hall",
      detail: "Census Halls are built on a town support tile. They add +25% local population growth.",
      glyph: "⌘",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CLEARING_HOUSE") {
    return structure({
      title: "Clearing House",
      detail: `Clearing Houses are built on a town support tile. One active clearing house raises the coin bonus of every Mintworks in this town and its directly connected towns from +${MINTWORKS_PER_MINTWORKS_PERCENT}% to +${MINTWORKS_PER_MINTWORKS_PERCENT_CLEARING_HOUSE}% per copy.`,
      glyph: "⌂",
      placement: "Build on an open garrisoned support tile for a town with a connected city network.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TRADE_NEXUS") {
    return structure({
      title: "Trade Nexus",
      detail: "Trade Nexuses are built on a town support tile. Towns only get a road connection (and its income bonus) to each other if at least one town in the network has a Trade Nexus.",
      glyph: "⚖",
      placement: "Build on an open garrisoned support tile for a town you own.",
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
      detail: "Relay Beacons are cheap border structures that extend vision, without the Siege Battery +25% offense profile.",
      glyph: "⚑",
      placement: "Build on an owned border tile with no town, resource, dock, or other structure.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    });
  }
  if (type === "SIEGE_TOWER") {
    return structure({
      title: "Siege Tower",
      detail: "Siege Towers upgrade Siege Batteries and raise their attack from 1.6x to 1.8x.",
      glyph: "⚔",
      placement: "Upgrade an existing Siege Battery on its current tile.",
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
  if (type === "ORE_REFINERY") {
    return structure({
      title: "Ore Refinery",
      detail: "Ore Refineries double active Mine slot output within 5 tiles.",
      glyph: "🏭",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "HARBOR_EXCHANGE") {
    return structure({
      title: "Harbor Exchange",
      detail: "Harbor exchanges are built beside a dock and add +5 coin per day for each connected owned dock.",
      glyph: "⚓",
      placement: "Build on a garrisoned dock tile you own.",
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
      placement: "Place on any garrisoned tile you own after finishing 3 Astral Dock Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "NEURAL_WORKS") {
    return structure({
      title: "Neural Works",
      detail: "Neural Works are mustering hubs that amplify every Ancillary Factory in this connected-town network (+0.1 manpower/min each) and speed up outpost muster within 50 tiles. Only one Neural Works is allowed per connected-town network.",
      glyph: "🚉",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "HYDROWORKS") {
    return structure({
      title: "Hydroworks",
      detail: `A network of irrigation canals. Every Hydrogarden within a 10-tile radius gains +${HYDROWORKS_HYDROGARDEN_FOOD_SLOT_BONUS} FOOD slots.`,
      glyph: "💧",
      placement: "Build on any garrisoned land tile. Does not need a resource tile.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "MINISTRY_HALL") {
    return structure({
      title: "Ministry Hall",
      detail: "Ministry halls reduce a nearby town's FOOD slot demand by its own tier step (e.g. -1 for City, -2 for Great City) within 10 tiles.",
      glyph: "🏛",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ANCILLARY_DEPOT") {
    return structure({
      title: "Ancillary Depot",
      detail: "Ancillary Depots add +150 manpower cap to this town, plus +300 manpower cap if a Reserve Lattice is in this town's connected network.",
      glyph: "🪖",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "WEAPONS_WORKSHOP") {
    return structure({
      title: "Weapons Workshop",
      detail: "Weapons Workshops forge Titanium and Umbrite into titanium-alloy plating and charged energy blades, granting a small empire-wide attack and defense boost. Unlike most buildings, there's no per-town limit — build many in one town to raise a dedicated military city.",
      glyph: "🗡",
      placement: "Build on an open garrisoned support tile for a town you own. No per-town limit.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "TITANIUM_WEAPONS_FACTORY") {
    return structure({
      title: "Titanium Weapons Factory",
      detail: "Titanium Weapons Factories forge armor plating from Titanium — armor doctrine: +1.5% attack / +3% defense per copy, empire-wide (like Weapons Workshop). No per-town limit, but each additional copy costs more manpower than the last. Owning zero Titanium or zero Umbrite Weapons Factories anywhere leaves your whole empire far easier to attack.",
      glyph: "🛡",
      placement: "Build on an open garrisoned support tile for a town you own. No per-town limit.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "UMBRITE_WEAPONS_FACTORY") {
    return structure({
      title: "Umbrite Weapons Factory",
      detail: "Umbrite Weapons Factories outfit raiders from Umbrite — raiding doctrine: +3% attack / +1.5% defense per copy, empire-wide (like Weapons Workshop). No per-town limit, but each additional copy costs more manpower than the last. Owning zero Umbrite or zero Titanium Weapons Factories anywhere leaves your whole empire far easier to attack.",
      glyph: "🗡",
      placement: "Build on an open garrisoned support tile for a town you own. No per-town limit.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "SKY_DOCK") {
    return structure({
      title: "Sky Dock",
      detail: "Sky Docks strip enemy ownership from a 3×3 area within 30 tiles (structures survive). Free to fire, with a 20-minute cooldown. Each tile has a 15% base miss chance, rising to 40% near forts. Blocked by Resonance Grids. Requires Ambaric Transformer power.",
      glyph: "✈",
      placement: "Build on garrisoned land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "AMBARIC_TRANSFORMER") {
    return structure({
      title: "Ambaric Transformer",
      detail: "Ambaric Transformers create a 30-tile power radius for late-game sky and monument structures. Chain them across your empire to keep advanced systems online.",
      glyph: "⚡",
      placement: "Build on garrisoned land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RESONANCE_GRID") {
    return structure({
      title: "Resonance Grid",
      detail: "Resonance Grids block enemy sky bombardment within 30 tiles and reveal the origin. They require Ambaric Transformer power.",
      glyph: "📡",
      placement: "Build on garrisoned land you own.",
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
  if (type === "SOVEREIGN_SIEGE_ENGINE_PART_1") {
    return structure({
      title: "The Long Barrel",
      detail: "The Long Barrel is one of the Sovereign Siege Engine's 3 required components — the tapered iron barrel the finished engine will fire through.",
      glyph: "🎯",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "SOVEREIGN_SIEGE_ENGINE_PART_2") {
    return structure({
      title: "Fracture Core",
      detail: "The Fracture Core is one of the Sovereign Siege Engine's 3 required components — the crystalline heart that powers each Worldbreaker shot.",
      glyph: "💥",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "SOVEREIGN_SIEGE_ENGINE_PART_3") {
    return structure({
      title: "Sky-Marking Array",
      detail: "The Sky-Marking Array is one of the Sovereign Siege Engine's 3 required components — the targeting rig the finished engine will sight its shots through.",
      glyph: "🔭",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "IMPERIAL_EXCHANGE") {
    return structure({
      title: "Imperial Exchange",
      detail: "Unique world monument. Once the three parts are complete, place it on any garrisoned tile you own — this consumes all 3 Imperial Exchange Parts — and, once every 24 hours, levy 100% of a single chosen rival's coin.",
      glyph: "✶",
      placement: "Place on any garrisoned tile you own after finishing 3 Imperial Exchange Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "SOVEREIGN_SIEGE_ENGINE") {
    return structure({
      title: "Sovereign Siege Engine",
      detail: "Unique world monument. Once the three parts are complete, place it on any garrisoned tile you own — this consumes all 3 Sovereign Siege Engine Parts — and fire one Worldbreaker shot every 10 minutes that destroys an enemy structure and cuts that town's population by 30%, for 1,000 coin.",
      glyph: "✸",
      placement: "Place on any garrisoned tile you own after finishing 3 Sovereign Siege Engine Parts. Consumes all 3 parts on completion.",
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
      detail: "Unique world monument. Once the three parts are complete, place it on any garrisoned tile you own — this consumes all 3 Aegis Dome Parts — to shield a 25-tile core and trigger a free 15-minute Aegis Lock every 60 minutes.",
      glyph: "⬡",
      placement: "Place on any garrisoned tile you own after finishing 3 Aegis Dome Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "QUARTERMASTERS_OFFICE") {
    return structure({
      title: "Quartermaster's Office",
      detail: "Quartermaster's Offices reduce the manpower cost by 33% for War-branch structures (Fort/Siege ladders) built within 20 tiles. Does not stack with other Quartermaster's Offices.",
      glyph: "🎖",
      placement: "Build on garrisoned land you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "ANCILLARY_FACTORY") {
    return structure({
      title: "Ancillary Factory",
      detail: "Ancillary Factories add +0.05 manpower/min empire-wide, standalone. A Neural Works in this town's connected network amplifies each one to +0.1/min.",
      glyph: "📦",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "RESERVE_LATTICE") {
    return structure({
      title: "Reserve Lattice",
      detail: "Reserve Lattices change every connected Ancillary Depot to +150 manpower cap and +35% of local terrain-adjusted base capacity. Only one Reserve Lattice is allowed per connected-town network.",
      glyph: "🏗",
      placement: "Build on an open garrisoned support tile for a town you own.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_DIRECTORATE_PART_1") {
    return structure({
      title: "Census Engine",
      detail: "The Census Engine is one of the Census Directorate's 3 required components — a rotary card-index drum for tracking every counted citizen.",
      glyph: "📋",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_DIRECTORATE_PART_2") {
    return structure({
      title: "Registry Vault",
      detail: "The Registry Vault is one of the Census Directorate's 3 required components — a strongbox for the empire's population records.",
      glyph: "🗄",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_DIRECTORATE_PART_3") {
    return structure({
      title: "Levy Charter",
      detail: "The Levy Charter is one of the Census Directorate's 3 required components — the founding writ that will authorize the finished Directorate's manpower bonus.",
      glyph: "📜",
      placement: "Build on an open support tile for a Great City or Monumental City you own that has no other monument component.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  if (type === "CENSUS_DIRECTORATE") {
    return structure({
      title: "Census Directorate",
      detail: "Unique world monument. Once the three parts are complete, place it on any garrisoned tile you own — this consumes all 3 Census Directorate Parts — to add +0.1 manpower/min empire-wide for every Manpower-branch building you own.",
      glyph: "◈",
      placement: "Place on any garrisoned tile you own after finishing 3 Census Directorate Parts. Consumes all 3 parts on completion.",
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
      detail: "Unique world monument. Once the three parts are complete, place it on any garrisoned tile you own — this consumes all 3 Titanium Levy Parts — to convert 50% of your currently-banked manpower into an instant one-time army, then freeze empire-wide manpower regen for 2 hours. Requires nearby Ambaric Transformer power.",
      glyph: "⬢",
      placement: "Place on any garrisoned tile you own after finishing 3 Titanium Levy Parts. Consumes all 3 parts on completion.",
      costBits: costBitsFor(type),
      buildTimeLabel: buildTimeLabelFor(type)
    }, imageFor(type));
  }
  return structure({
    title: "Siege Battery",
    detail: "Siege Batteries are offensive staging structures for border tiles. They add +60% local offense to attacks launched from their tile.",
    glyph: "⚔",
    placement: "Build on a garrisoned border tile you own.",
    costBits: costBitsFor(type),
    buildTimeLabel: buildTimeLabelFor(type)
  });
};

export const structureInfoButtonHtml = (
  type: StructureInfoKey,
  deps: { formatCooldownShort: (ms: number) => string; prettyToken: (value: string) => string; ownedCountOfType?: number | undefined },
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

// Plain-text glyph (canvas text, titles); HTML callers use resourceIconHtml.
export const resourceIconForKey = resourceIconGlyph;

export const strategicResourceKeyForTile = (tile: Tile): "FOOD" | "TITANIUM" | "CRYSTAL" | "UMBRITE" | undefined => {
  if (tile.resource === "FARM" || tile.resource === "FISH") return "FOOD";
  if (tile.resource === "TITANIUM") return "TITANIUM";
  if (tile.resource === "GEMS") return "CRYSTAL";
  if (tile.resource === "UMBRITE") return "UMBRITE";
  return undefined;
};

// Tiles only produce gold directly; strategic resources are slot-based
// (structure-slots.ts), not a per-tile daily yield.
export const tileProductionHtml = (tile: Tile): string => {
  const gpd = (tile.yieldRate?.goldPerMinute ?? 0) * 1440;
  return tile.town || gpd > 0 ? `${resourceIconHtml("GOLD")} ${gpd.toFixed(1)}/day` : "";
};
