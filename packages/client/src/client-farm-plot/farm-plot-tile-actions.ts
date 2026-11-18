// Tile-menu rows for the Farm Plot (docs/farm-plot-plan.md):
//   - on a town tile or a plain (no resource) support tile: Build Farm Plot;
//   - on your Farm Plot: Upgrade to Hydrogarden Plot (greyed until Hyperfeed
//     Seedstock is commissioned).
// Placement and the upgrade gate come from the same shared helpers the sim
// uses (structureShowsOnTile's excludesResourceTiles, farmPlotUpgradeForChoice).
import { FARM_PLOT_FOOD_SLOT_SUPPLY, FARM_PLOT_UPGRADE_TECH_ID, farmPlotUpgradeForChoice } from "@border-empires/shared";
import { economicBuildMsForState } from "../client-build-speed/client-build-speed.js";
import type { RefineryActionDeps } from "../client-refineries/refinery-tile-actions.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import type { ClientState } from "../client-state/client-state.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import type { Tile, TileActionDef } from "../client-types.js";

export type FarmPlotActionDeps = RefineryActionDeps & {
  buildDetailTextForAction: (id: TileActionDef["id"], tile: Tile) => string | undefined;
};

type PlotType = "FARM_PLOT" | "HYDROGARDEN_PLOT";

const foodLabel = (type: PlotType): string => {
  const slots = FARM_PLOT_FOOD_SLOT_SUPPLY[type] ?? 0;
  return `+${slots} FOOD ${slots === 1 ? "slot" : "slots"}`;
};

const costLine = (state: ClientState, deps: FarmPlotActionDeps, type: PlotType): string =>
  `${deps.structureCostText(type)} • ${buildTimeLabel(economicBuildMsForState(state, type))} • ${foodLabel(type)}${upkeepSuffixFor(type)}`;

const row = (
  id: TileActionDef["id"], label: string, detail: string, [enabled, reason, cost]: [boolean, string, string]
): TileActionDef => ({ id, label, detail, disabled: !enabled, ...(enabled ? {} : { disabledReason: reason }), cost });

const hyperfeedName = (state: ClientState): string =>
  state.techCatalog.find((tech) => tech.id === FARM_PLOT_UPGRADE_TECH_ID)?.name ?? "Hyperfeed Seedstock";

/** The Farm Plot build row and its upgrade row, for whichever applies to this tile. */
export const farmPlotTileActions = (state: ClientState, tile: Tile, deps: FarmPlotActionDeps): TileActionDef[] => {
  const structure = tile.economicStructure;
  if (structure?.ownerId === state.me && structure.type === "FARM_PLOT") {
    if (structure.status !== "active" && structure.status !== "inactive") return [];
    const choice = farmPlotUpgradeForChoice(structure.type, (id) => state.techIds.includes(id));
    const reason = choice.ok ? "" : state.techIds.includes(FARM_PLOT_UPGRADE_TECH_ID) ? choice.reason : `Requires ${hyperfeedName(state)}`;
    return [row("build_hydrogarden_plot", "Upgrade to Hydrogarden Plot", deps.buildDetailTextForAction("build_hydrogarden_plot", tile) ?? "",
      deps.availability("HYDROGARDEN_PLOT", choice.ok, reason, costLine(state, deps, "HYDROGARDEN_PLOT")))];
  }
  // A town's support ring only; a resource tile takes that resource's own building instead, and an occupied plot shows its own rows.
  if (!deps.townBuildSource || (!tile.town && (tile.resource || structure))) return [];
  const blocked = deps.supportPlacementBlockedReason;
  return [row("build_farm_plot", "Build Farm Plot", deps.buildDetailTextForAction("build_farm_plot", tile) ?? "",
    deps.availability("FARM_PLOT", !blocked, blocked ?? "Unavailable", costLine(state, deps, "FARM_PLOT")))];
};
