import { converterInfoEffects } from "./client-structure-info-catalog/converter-info.js";
import { structureDisplayName, type StructureDisplayKey } from "@border-empires/shared";
import { STRUCTURE_PRESENTATION } from "./client-structure-info-catalog/structure-presentation.js";
import { structureModelBriefFor } from "./client-structure-info-catalog/structure-model-briefs.js";
import {
  economicStructureBuildDurationMs, type SlotStructureType
} from "@border-empires/shared";
import { structureInfoBuildMs, type BuildSpeedState } from "./client-structure-time-labels/client-structure-time-labels.js";
import {
  structureModifiersFor, type StructureModifier
} from "@border-empires/game-domain";
import type { Tile } from "./client-types.js";
import { resourceIconGlyph, resourceIconHtml } from "./client-resource-icons/client-resource-icons.js";
import { structureInfoArtUrl } from "./client-structure-art/client-structure-art.js";
import { costBitsFor, structureBaseKey } from "./client-structure-cost-bits.js";
import { upkeepDescriptorFor } from "./client-structure-upkeep-text/client-structure-upkeep-text.js";

export type EconomicStructureType = NonNullable<Tile["economicStructure"]>["type"];

// Canonical display keys include all live structures and two retired save types.
export type StructureInfoKey = StructureDisplayKey;

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
    { type: "IMPERIAL_EXCHANGE_PART_1", name: structureDisplayName("IMPERIAL_EXCHANGE_PART_1") },
    { type: "IMPERIAL_EXCHANGE_PART_2", name: structureDisplayName("IMPERIAL_EXCHANGE_PART_2") },
    { type: "IMPERIAL_EXCHANGE_PART_3", name: structureDisplayName("IMPERIAL_EXCHANGE_PART_3") }
  ],
  SOVEREIGN_SIEGE_ENGINE: [
    { type: "SOVEREIGN_SIEGE_ENGINE_PART_1", name: structureDisplayName("SOVEREIGN_SIEGE_ENGINE_PART_1") },
    { type: "SOVEREIGN_SIEGE_ENGINE_PART_2", name: structureDisplayName("SOVEREIGN_SIEGE_ENGINE_PART_2") },
    { type: "SOVEREIGN_SIEGE_ENGINE_PART_3", name: structureDisplayName("SOVEREIGN_SIEGE_ENGINE_PART_3") }
  ],
  AEGIS_DOME: [
    { type: "AEGIS_DOME_PART_1", name: structureDisplayName("AEGIS_DOME_PART_1") },
    { type: "AEGIS_DOME_PART_2", name: structureDisplayName("AEGIS_DOME_PART_2") },
    { type: "AEGIS_DOME_PART_3", name: structureDisplayName("AEGIS_DOME_PART_3") }
  ],
  ASTRAL_DOCK: [
    { type: "ASTRAL_DOCK_PART_1", name: structureDisplayName("ASTRAL_DOCK_PART_1") },
    { type: "ASTRAL_DOCK_PART_2", name: structureDisplayName("ASTRAL_DOCK_PART_2") },
    { type: "ASTRAL_DOCK_PART_3", name: structureDisplayName("ASTRAL_DOCK_PART_3") }
  ],
  CENSUS_DIRECTORATE: [
    { type: "CENSUS_DIRECTORATE_PART_1", name: structureDisplayName("CENSUS_DIRECTORATE_PART_1") },
    { type: "CENSUS_DIRECTORATE_PART_2", name: structureDisplayName("CENSUS_DIRECTORATE_PART_2") },
    { type: "CENSUS_DIRECTORATE_PART_3", name: structureDisplayName("CENSUS_DIRECTORATE_PART_3") }
  ],
  TITANIUM_LEVY: [
    { type: "TITANIUM_LEVY_PART_1", name: structureDisplayName("TITANIUM_LEVY_PART_1") },
    { type: "TITANIUM_LEVY_PART_2", name: structureDisplayName("TITANIUM_LEVY_PART_2") },
    { type: "TITANIUM_LEVY_PART_3", name: structureDisplayName("TITANIUM_LEVY_PART_3") }
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
  MANUFACTORY: "Economy", CLEARING_HOUSE: "Economy",
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
    const converter = converterInfoEffects(key);
    if (converter) return converter;
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
    if (key === "MANUFACTORY") return ["Stacks additively across every active Manufactory in the town"];
    if (key === "INCUBATION_ENGINE") return [];
    if (key === "CENSUS_HALL") return [];
    if (key === "CLEARING_HOUSE") return [];
    if (key === "TRADE_NEXUS") return ["Enables the connected-town income bonus for this road network"];
    if (key === "ORE_REFINERY") return [];
    if (key === "HARBOR_EXCHANGE") return [];
    if (key === "MINISTRY_HALL") return [];
    if (key === "ANCILLARY_DEPOT") return ["Also boosts manpower cap further if a Reserve Lattice is in this town's connected network"];
    if (key === "SKY_DOCK") return ["Strips ownership from a 3×3 area (structures survive)", "Free • 20m cooldown", "Blocked by Resonance Grids", "Requires nearby Ambaric Transformer power"];
    if (key === "AMBARIC_TRANSFORMER") return ["Powers nearby Sky Docks, Resonance Grids, and monuments", "Can chain power through other Ambaric Transformers"];
    if (key === "RESONANCE_GRID") return ["Requires nearby Ambaric Transformer power"];
    if (key === "QUARTERMASTERS_OFFICE") return ["Retired; retained for previously saved structures"];
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
    if (key === "WEAPONS_WORKSHOP") return ["Retired; replaced by Titanium and Umbrite Weapons Factories"];
    if (key === "TITANIUM_WEAPONS_FACTORY") return ["Escalating manpower cost — each additional copy you own costs more", "No per-town limit — armor doctrine"];
    if (key === "UMBRITE_WEAPONS_FACTORY") return ["Escalating manpower cost — each additional copy you own costs more", "No per-town limit — raiding doctrine"];
    return [];
  };
  const modifiersFor = (key: StructureInfoKey): StructureModifier[] => structureModifiersFor(key, {});
  const structure = (base: Omit<StructureInfoView, "image" | "effects" | "modifiers" | "upkeepBits" | "branch">, image?: string): StructureInfoView => {
    const branch = STRUCTURE_BRANCH_BY_KEY[type];
    return image
      ? { ...base, effects: effectsFor(type), modifiers: modifiersFor(type), upkeepBits: upkeepBitsFor(type), image, ...(branch ? { branch } : {}) }
      : { ...base, effects: effectsFor(type), modifiers: modifiersFor(type), upkeepBits: upkeepBitsFor(type), ...(branch ? { branch } : {}) };
  };
  const imageFor = (key: StructureInfoKey): string | undefined => structureInfoArtUrl(key);
  const presentation = STRUCTURE_PRESENTATION[type];
  return structure({
    title: structureDisplayName(type),
    detail: structureModelBriefFor(type).role,
    glyph: presentation.glyph,
    placement: presentation.placement,
    costBits: costBitsFor(type),
    buildTimeLabel: buildTimeLabelFor(type)
  }, imageFor(type));
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
