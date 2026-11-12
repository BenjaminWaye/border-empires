// Tile-menu rows for town refineries (docs/territory-development-plan.md,
// Phase 2, Client):
//   - on a town / support tile: Build Titanium / Umbrite / Crystal Refinery
//     (greyed when no unclaimed field of its resource is linked) and the three
//     one-per-town boosters;
//   - on your deposit tile: "Refine at…" (greyed with the reason when no town
//     of yours can take the field);
//   - on your refinery: "Change field".
import {
  REFINERY_BOOSTER_TYPES, REFINERY_FIELD_RESOURCE_BY_TYPE, REFINERY_REACH_LAND_TILES, REFINERY_TYPES, TECH_REQUIREMENTS_BY_STRUCTURE,
  structureDisplayName, type BuildableStructureType, type RefineryBoosterType, type RefineryType
} from "@border-empires/shared";
import { economicBuildMsForState } from "../client-build-speed/client-build-speed.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import type { ClientState } from "../client-state/client-state.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import type { SupportTownStructureKey } from "../client-support-structures/client-support-structures.js";
import { hasFreeResourceSlots, missingResourceSlotReason } from "../client-tile-action-logic/client-resource-slot-gate.js";
import type { Tile, TileActionDef } from "../client-types.js";
import type { RefineryBuildActionId } from "./refinery-action-ids.js";
import { refineryStatusFor } from "./refinery-client-status.js";
import { refineryFieldOptions, refineryPerTileSlots } from "./refinery-field-options.js";
import { refineAtTownChoices, refineryTypeForDeposit } from "./refinery-towns.js";

export type RefineryActionDeps = {
  structureCostText: (type: BuildableStructureType) => string;
  availability: (type: BuildableStructureType, eligible: boolean, reason: string, cost: string) => [boolean, string, string];
  /** The town a build here serves (the tile itself, or the town whose ring it is on); undefined off any ring. */
  townBuildSource?: Tile | undefined;
  /** The tile already holds a structure, so a support building cannot go on it. */
  supportPlacementBlocked?: boolean;
  townHasSupportStructure?: (town: Tile | undefined, type: SupportTownStructureKey) => boolean;
};

type ActionState = ClientState;

const ACTION_ID_BY_TYPE: Readonly<Record<RefineryType | RefineryBoosterType, RefineryBuildActionId>> = {
  TITANIUM_REFINERY: "build_titanium_refinery", UMBRITE_REFINERY: "build_umbrite_refinery", CRYSTAL_REFINERY: "build_crystal_refinery",
  TITANIUM_SMELTER: "build_titanium_smelter", UMBRITE_DISTILLERY: "build_umbrite_distillery", CRYSTAL_CUTTER: "build_crystal_cutter"
};

const RESOURCE_NAME = { TITANIUM: "Titanium", UMBRITE: "Umbrite", GEMS: "Gems" } as const;
const BOOSTER_RESOURCE_NAME: Readonly<Record<RefineryBoosterType, string>> = { TITANIUM_SMELTER: "Titanium", UMBRITE_DISTILLERY: "Umbrite", CRYSTAL_CUTTER: "Gems" };

const techReason = (state: ActionState, type: RefineryType | RefineryBoosterType): string | undefined => {
  const tech = TECH_REQUIREMENTS_BY_STRUCTURE[type];
  if (!tech || state.techIds.includes(tech)) return undefined;
  return `Requires ${state.techCatalog.find((entry) => entry.id === tech)?.name ?? tech.split("-").join(" ")}`;
};

const row = (
  id: TileActionDef["id"], label: string, detail: string, [enabled, reason, cost]: [boolean, string, string]
): TileActionDef => ({ id, label, detail, disabled: !enabled, ...(enabled ? {} : { disabledReason: reason }), cost });

const costLine = (state: ActionState, deps: RefineryActionDeps, type: RefineryType | RefineryBoosterType, effect: string): string =>
  `${deps.structureCostText(type)} • ${buildTimeLabel(economicBuildMsForState(state, type))} • ${effect}${upkeepSuffixFor(type)}`;

/** Build rows for the three refineries and three boosters on a town or support tile. */
export const refineryBuildRows = (state: ActionState, deps: RefineryActionDeps): TileActionDef[] => {
  const town = deps.townBuildSource;
  if (!town) return [];
  const townKey = `${town.x},${town.y}`;
  const rows: TileActionDef[] = [];
  for (const type of REFINERY_TYPES) {
    const resource = RESOURCE_NAME[REFINERY_FIELD_RESOURCE_BY_TYPE[type]];
    const options = refineryFieldOptions(state.tiles, state.me, type, townKey);
    const eligible = options.filter((option) => option.status === "eligible");
    const tech = techReason(state, type);
    const reason = deps.supportPlacementBlocked ? "Tile already has structure"
      : tech ?? (eligible.length === 0
        ? options.length > 0 ? `No free ${resource} field linked: ${options[0]!.reason ?? "all taken"}` : `No ${resource} field within ${REFINERY_REACH_LAND_TILES} land tiles of this town`
        : missingResourceSlotReason(state, type));
    const available = !deps.supportPlacementBlocked && !tech && eligible.length > 0 && hasFreeResourceSlots(state, type);
    const best = eligible.reduce((max, option) => Math.max(max, option.slotGain), 0);
    const effect = eligible.length > 0 ? `best field +${best} slots (+${eligible[0]!.perTileSlots} per garrisoned tile)` : `+${refineryPerTileSlots(false)} slots per garrisoned field tile`;
    rows.push(row(ACTION_ID_BY_TYPE[type], `Build ${structureDisplayName(type)}`,
      `Processes one ${resource} field within ${REFINERY_REACH_LAND_TILES} land tiles of this town, linked by your land. ${eligible.length === 1 ? "Its one eligible field is chosen for you." : eligible.length > 1 ? `Choose from ${eligible.length} fields.` : ""}`.trim(),
      deps.availability(type, available, reason ?? "Unavailable", costLine(state, deps, type, effect))));
  }
  for (const type of REFINERY_BOOSTER_TYPES) {
    const resource = BOOSTER_RESOURCE_NAME[type];
    const has = deps.townHasSupportStructure?.(town, type) ?? false;
    const tech = techReason(state, type);
    const reason = deps.supportPlacementBlocked ? "Tile already has structure"
      : has ? `This town already has a ${structureDisplayName(type)}` : tech ?? missingResourceSlotReason(state, type);
    const available = !deps.supportPlacementBlocked && !has && !tech && hasFreeResourceSlots(state, type);
    rows.push(row(ACTION_ID_BY_TYPE[type], `Build ${structureDisplayName(type)}`,
      `One per town. Each tile this town's ${resource} refineries process gives +${refineryPerTileSlots(true)} slots instead of +${refineryPerTileSlots(false)}.`,
      deps.availability(type, available, reason ?? "Unavailable", costLine(state, deps, type, "+1 slot per processed tile"))));
  }
  return rows;
};

/** "Refine at…" on your strategic deposit tile. */
export const refineAtRow = (state: ActionState, tile: Tile, deps: RefineryActionDeps): TileActionDef | undefined => {
  const type = refineryTypeForDeposit(tile);
  if (!type || tile.ownerId !== state.me) return undefined;
  const choices = refineAtTownChoices(state.tiles, state.me, tile);
  const open = choices.filter((choice) => !choice.disabledReason);
  const tech = techReason(state, type);
  const reason = tech ?? (choices.length === 0 ? `No town of yours within ${REFINERY_REACH_LAND_TILES} land tiles of this field`
    : open.length === 0 ? choices[0]!.disabledReason! : missingResourceSlotReason(state, type));
  const available = !tech && open.length > 0 && hasFreeResourceSlots(state, type);
  const best = open[0]?.option;
  const effect = best ? `+${best.slotGain} slots now at ${open[0]!.townName}` : `+${refineryPerTileSlots(false)} slots per garrisoned field tile`;
  return row("refine_at_town", "Refine at…",
    `Build a ${structureDisplayName(type)} on a free support tile of a town in reach; it processes this whole field.${open.length > 0 ? ` ${open.length} town${open.length === 1 ? "" : "s"} can take it.` : ""}`,
    deps.availability(type, available, reason ?? "Unavailable", costLine(state, deps, type, effect)));
};

/** "Change field" on your refinery. */
export const changeFieldRow = (state: ActionState, tile: Tile): TileActionDef | undefined => {
  const record = tile.economicStructure;
  const status = refineryStatusFor(state, tile);
  if (!status || record?.ownerId !== state.me || record.status === "removing") return undefined;
  const current = status.anchor ? `Now processing the field at (${status.anchor.x}, ${status.anchor.y}): ${status.processedTileKeys.length} tile${status.processedTileKeys.length === 1 ? "" : "s"} refined.` : "It has no field yet.";
  return { id: "change_refinery_field", label: status.needsField ? "Choose field" : "Change field", detail: `${current} Pick another field within reach of its town.`, disabled: false };
};

/** Every refinery row for a tile you own. */
export const refineryTileActions = (state: ActionState, tile: Tile, deps: RefineryActionDeps): TileActionDef[] => {
  const rows = refineryBuildRows(state, deps);
  const refine = refineAtRow(state, tile, deps);
  const change = changeFieldRow(state, tile);
  return [...(refine ? [refine] : []), ...(change ? [change] : []), ...rows];
};
