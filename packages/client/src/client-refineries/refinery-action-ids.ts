// Tile-menu action ids for town refineries and their boosters
// (docs/territory-development-plan.md, Phase 2). The build rows map to their
// structure and tech like every other build_<type> row
// (client-build-action-dispatch.ts reads these maps); "Refine at…" and
// "Change field" open pickers instead (refinery-picker-flow.ts).
import { TECH_REQUIREMENTS_BY_STRUCTURE, type RefineryBoosterType, type RefineryType } from "@border-empires/shared";

export type RefineryBuildActionId =
  | "build_titanium_refinery" | "build_umbrite_refinery" | "build_crystal_refinery"
  | "build_titanium_smelter" | "build_umbrite_distillery" | "build_crystal_cutter";

export type RefineryPickerActionId = "refine_at_town" | "change_refinery_field";

export const REFINERY_BUILD_ACTION_TYPES: Readonly<Record<RefineryBuildActionId, RefineryType | RefineryBoosterType>> = {
  build_titanium_refinery: "TITANIUM_REFINERY",
  build_umbrite_refinery: "UMBRITE_REFINERY",
  build_crystal_refinery: "CRYSTAL_REFINERY",
  build_titanium_smelter: "TITANIUM_SMELTER",
  build_umbrite_distillery: "UMBRITE_DISTILLERY",
  build_crystal_cutter: "CRYSTAL_CUTTER"
};

export const isRefineryBuildActionId = (id: string): id is RefineryBuildActionId => id in REFINERY_BUILD_ACTION_TYPES;

/** The structure a refinery / booster build row builds; undefined for every other action. */
export const refineryStructureForAction = (id: string): RefineryType | RefineryBoosterType | undefined =>
  isRefineryBuildActionId(id) ? REFINERY_BUILD_ACTION_TYPES[id] : undefined;

/** The tech a refinery / booster build row needs (the registry's gate). */
export const refineryTechForAction = (id: string): string | undefined => {
  const type = refineryStructureForAction(id);
  return type ? TECH_REQUIREMENTS_BY_STRUCTURE[type] : undefined;
};
