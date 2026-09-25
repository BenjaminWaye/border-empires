// Manpower-branch structure build actions (Ancillary Factory/Ancillary
// Depot/Neural Works/Reserve Lattice/Logistics Guild), extracted out of
// menuActionsForSingleTile (client-tile-action-logic.ts) purely to keep
// that file's line count from growing past the repo's 500-line new-growth
// cap (AGENTS.md) -- no logic changes here, just a code move, done as part
// of the Manifest tree naming/lore pass's Ancillary Depot/Reserve Lattice
// split (docs/manifest-tree-mapping-plan.md).
import { type BuildableStructureType } from "@border-empires/shared";
import { economicStructureBuildMs } from "../client-map-display.js";
import { buildShowsOnTile } from "../client-tile-action-support/client-tile-action-support.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import type { DevelopmentSlotSummary } from "../client-queue-logic/client-queue-logic.js";
import {
  chainedBuildAvailabilityFromModule,
  frontierBuildDetailSuffix,
  hasFreeResourceSlots,
  missingResourceSlotReason,
  tileActionAvailabilityWithDevelopmentSlot,
  type TileActionLogicDeps
} from "./client-tile-action-logic.js";

const chainedBuildAvailability = (
  deps: TileActionLogicDeps,
  state: ClientState,
  tile: Tile,
  structureType: BuildableStructureType,
  eligible: boolean,
  ineligible: string,
  cost: string
): [boolean, string, string] => chainedBuildAvailabilityFromModule(deps, state, tile, structureType, eligible, ineligible, cost);

/** Ancillary Factory (GARRISON_HALL) and Ancillary Depot: per-tile, no town-network gating. */
export const garrisonHallAndAncillaryDepotActions = (
  state: ClientState,
  tile: Tile,
  supportedTownsLength: number,
  supportedDocksLength: number,
  slots: DevelopmentSlotSummary,
  deps: TileActionLogicDeps
): TileActionDef[] => {
  const out: TileActionDef[] = [];
  if (buildShowsOnTile("GARRISON_HALL", tile, supportedTownsLength, supportedDocksLength)) {
    out.push({
      id: "build_garrison_hall",
      label: "Build Ancillary Factory",
      detail: deps.buildDetailTextForAction("build_garrison_hall", tile) + frontierBuildDetailSuffix(tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        ...chainedBuildAvailability(
          deps,
          state,
          tile,
          "GARRISON_HALL",
          state.techIds.includes("remade-concordat") && hasFreeResourceSlots(state, "GARRISON_HALL") && !tile.siegeOutpost && !tile.observatory,
          !state.techIds.includes("remade-concordat")
            ? "Requires Ancillary Control Core"
            : tile.siegeOutpost || tile.observatory
              ? "Tile already has structure"
              : missingResourceSlotReason(state, "GARRISON_HALL") ?? "Unavailable",
          `${deps.structureCostText("GARRISON_HALL")} • ${Math.round(economicStructureBuildMs("GARRISON_HALL") / 60000)}m • +0.05 manpower/min empire-wide • +0.1/min per copy instead when covered by a Neural Works network`
        ),
        slots,
        deps
      )
    });
  }
  if (buildShowsOnTile("ANCILLARY_DEPOT", tile, supportedTownsLength, supportedDocksLength)) {
    out.push({
      id: "build_ancillary_depot",
      label: "Build Ancillary Depot",
      detail: deps.buildDetailTextForAction("build_ancillary_depot", tile) + frontierBuildDetailSuffix(tile),
      ...tileActionAvailabilityWithDevelopmentSlot(
        ...chainedBuildAvailability(
          deps,
          state,
          tile,
          "ANCILLARY_DEPOT",
          state.techIds.includes("organized-supply") && hasFreeResourceSlots(state, "ANCILLARY_DEPOT") && !tile.siegeOutpost && !tile.observatory,
          !state.techIds.includes("organized-supply")
            ? "Requires Reserve Custody Cadre"
            : tile.siegeOutpost || tile.observatory
              ? "Tile already has structure"
              : missingResourceSlotReason(state, "ANCILLARY_DEPOT") ?? "Unavailable",
          `${deps.structureCostText("ANCILLARY_DEPOT")} • ${Math.round(economicStructureBuildMs("ANCILLARY_DEPOT") / 60000)}m • +150 manpower cap`
        ),
        slots,
        deps
      )
    });
  }
  return out;
};

/** Neural Works (ASSEMBLY_WORKS), Reserve Lattice, and Logistics Guild: town-support, one-per-network structures. */
export const manpowerNetworkStructureActions = (
  state: ClientState,
  tile: Tile,
  townBuildSource: Tile,
  supportPlacementBlocked: boolean,
  townHasAssemblyWorks: boolean,
  townHasReserveLattice: boolean,
  townHasLogisticsGuild: boolean,
  slots: DevelopmentSlotSummary,
  deps: TileActionLogicDeps
): TileActionDef[] => [
  {
    id: "build_assembly_works",
    label: "Build Neural Works",
    detail: deps.buildDetailTextForAction("build_assembly_works", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
    ...tileActionAvailabilityWithDevelopmentSlot(
      ...chainedBuildAvailability(
        deps,
        state,
        tile,
        "ASSEMBLY_WORKS",
        !supportPlacementBlocked &&
          !townHasAssemblyWorks &&
          state.techIds.includes("global-trade-networks") &&
          hasFreeResourceSlots(state, "ASSEMBLY_WORKS"),
        supportPlacementBlocked
          ? "Tile already has structure"
          : townHasAssemblyWorks
            ? "Nearby town already has Neural Works"
            : !state.techIds.includes("global-trade-networks")
              ? "Requires Neural Assembly Core"
              : (missingResourceSlotReason(state, "ASSEMBLY_WORKS") ?? "Unavailable"),
        `${deps.structureCostText("ASSEMBLY_WORKS")} • ${Math.round(economicStructureBuildMs("ASSEMBLY_WORKS") / 60000)}m • +0.1 manpower/min per Ancillary Factory in this town's connected network • one per connected-town network`
      ),
      slots,
      deps
    )
  },
  {
    id: "build_reserve_lattice",
    label: "Build Reserve Lattice",
    detail: deps.buildDetailTextForAction("build_reserve_lattice", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
    ...tileActionAvailabilityWithDevelopmentSlot(
      ...chainedBuildAvailability(
        deps,
        state,
        tile,
        "RESERVE_LATTICE",
        !supportPlacementBlocked &&
          !townHasReserveLattice &&
          state.techIds.includes("conveyor-networks") &&
          hasFreeResourceSlots(state, "RESERVE_LATTICE"),
        supportPlacementBlocked
          ? "Tile already has structure"
          : townHasReserveLattice
            ? "Nearby town already has Reserve Lattice"
            : !state.techIds.includes("conveyor-networks")
              ? "Requires Reserve Lattice Module"
              : (missingResourceSlotReason(state, "RESERVE_LATTICE") ?? "Unavailable"),
        `${deps.structureCostText("RESERVE_LATTICE")} • ${Math.round(economicStructureBuildMs("RESERVE_LATTICE") / 60000)}m • +150 manpower cap and +35% of this town's terrain-adjusted base capacity • one per connected-town network`
      ),
      slots,
      deps
    )
  },
  {
    id: "build_logistics_guild",
    label: "Build Logistics Guild",
    detail: deps.buildDetailTextForAction("build_logistics_guild", tile, townBuildSource) + frontierBuildDetailSuffix(tile),
    ...tileActionAvailabilityWithDevelopmentSlot(
      ...chainedBuildAvailability(
        deps,
        state,
        tile,
        "LOGISTICS_GUILD",
        !supportPlacementBlocked &&
          !townHasLogisticsGuild &&
          state.techIds.includes("remade-concordat") &&
          hasFreeResourceSlots(state, "LOGISTICS_GUILD"),
        supportPlacementBlocked
          ? "Tile already has structure"
          : townHasLogisticsGuild
            ? "Town already has Logistics Guild"
            : !state.techIds.includes("remade-concordat")
              ? "Requires Ancillary Control Core"
              : (missingResourceSlotReason(state, "LOGISTICS_GUILD") ?? "Unavailable"),
        `${deps.structureCostText("LOGISTICS_GUILD")} • ${Math.round(economicStructureBuildMs("LOGISTICS_GUILD") / 60000)}m • +0.05 manpower/min empire-wide, +0.1/min if a Rail Depot is in this town's connected network`
      ),
      slots,
      deps
    )
  }
];
