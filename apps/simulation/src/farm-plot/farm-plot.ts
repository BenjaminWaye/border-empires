// Farm Plot (docs/farm-plot-plan.md): a manpower-built FOOD source on a plain
// town support-ring tile, and its in-place Hydrogarden Plot upgrade.
//
// A plot supplies FOOD slots through resourceSlotSupplyForPlayer
// (resource-slot-view.ts) without touching tile.resource: worldgen resources
// stay immutable (spawn placement caches food coords on that assumption) and
// the structure needs no new snapshot tile fields.
import type { DomainTileState } from "@border-empires/game-domain";
import { FARM_PLOT_FOOD_SLOT_SUPPLY } from "@border-empires/shared";

type PlotStructure = NonNullable<DomainTileState["economicStructure"]>;

export const isFarmPlotFamily = (type: string | undefined): type is "FARM_PLOT" | "HYDROGARDEN_PLOT" =>
  type === "FARM_PLOT" || type === "HYDROGARDEN_PLOT";

/**
 * FOOD slots a plot on this tile supplies right now, and the structure type
 * they are reported under. A Hydrogarden Plot under construction is always
 * an upgrade of a standing Farm Plot (farmPlotUpgradeForChoice never allows
 * a fresh one), so it keeps supplying the Farm Plot's FOOD until the upgrade
 * completes, the way a fort upgrade keeps the old tier defending.
 */
export const farmPlotFoodSupply = (
  structure: Pick<PlotStructure, "type" | "status" | "inactiveReason"> | undefined
): { type: "FARM_PLOT" | "HYDROGARDEN_PLOT"; slots: number } | undefined => {
  if (!structure || !isFarmPlotFamily(structure.type) || structure.inactiveReason === "manual") return undefined;
  if (structure.status === "active") return { type: structure.type, slots: FARM_PLOT_FOOD_SLOT_SUPPLY[structure.type] ?? 0 };
  if (structure.status === "under_construction" && structure.type === "HYDROGARDEN_PLOT") {
    return { type: "FARM_PLOT", slots: FARM_PLOT_FOOD_SLOT_SUPPLY.FARM_PLOT ?? 0 };
  }
  return undefined;
};

/** What a cancelled Hydrogarden Plot upgrade leaves behind: the Farm Plot it was replacing. */
export const farmPlotAfterCancelledUpgrade = (structure: PlotStructure): PlotStructure => {
  const { completesAt: _completesAt, startedAt: _startedAt, pausedAt: _pausedAt, ...rest } = structure;
  return { ...rest, type: "FARM_PLOT", status: "active" };
};
