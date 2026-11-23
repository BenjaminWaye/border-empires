// Manpower-branch support-tile build rows (Ancillary Depot, Vivarium) --
// extracted from client-tile-action-logic.ts (over the 500-line file-size
// limit) so adding a row there does not grow that file.
import { ANCILLARY_DEPOT_MANPOWER_CAP_BONUS, VIVARIUM_BIOTA_SLOTS } from "@border-empires/shared";
import { economicBuildMsForState } from "../client-build-speed/client-build-speed.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import type { ClientState } from "../client-state/client-state.js";
import { hasBuildTech } from "../client-afc-module-access/client-afc-module-access.js";
import { buildShowsOnTile } from "../client-tile-action-support/client-tile-action-support.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { tileActionAvailability } from "./client-tile-action-availability.js";
import type { TileActionLogicDeps } from "./client-tile-action-logic.js";
import { hasFreeResourceSlots, missingResourceSlotReason } from "./client-resource-slot-gate.js";

export const frontierBuildDetailSuffix = (tile: Tile): string =>
  tile.ownershipState === "FRONTIER" ? " • garrisons this tile first" : "";

type ManpowerSupportType = "ANCILLARY_DEPOT" | "VIVARIUM";
/** The tile-action file's chainedBuildAvailability closure (settle-first cost, reach and manpower gates). */
export type ChainedBuildAvailability = (structureType: ManpowerSupportType, eligible: boolean, ineligible: string, cost: string) => [boolean, string, string];

const ROWS: readonly { type: ManpowerSupportType; id: "build_ancillary_depot" | "build_vivarium"; label: string; techId: string; techName: string; effect: string }[] = [
  {
    type: "ANCILLARY_DEPOT", id: "build_ancillary_depot", label: "Build Ancillary Depot", techId: "organized-supply", techName: "Reserve Custody Cadre",
    effect: `+${ANCILLARY_DEPOT_MANPOWER_CAP_BONUS} manpower cap plus +10% of this town's terrain-adjusted base capacity • +35% instead when covered by a Reserve Lattice network`
  },
  {
    type: "VIVARIUM", id: "build_vivarium", label: "Build Vivarium", techId: "census-records", techName: "Census Office",
    effect: `covers ${VIVARIUM_BIOTA_SLOTS} of this town's luxury biota ${VIVARIUM_BIOTA_SLOTS === 1 ? "slot" : "slots"}, so it needs one less from biota sites`
  }
];

export const manpowerSupportBuildActions = (
  state: ClientState,
  tile: Tile,
  deps: TileActionLogicDeps,
  chained: ChainedBuildAvailability,
  supportedTownCount: number,
  supportedDockCount: number
): TileActionDef[] => {
  const out: TileActionDef[] = [];
  for (const row of ROWS) {
    if (!buildShowsOnTile(row.type, tile, supportedTownCount, supportedDockCount)) continue;
    const researched = hasBuildTech(state, row.techId);
    const occupied = Boolean(tile.siegeBattery || tile.observatory);
    out.push({
      id: row.id,
      label: row.label,
      detail: (deps.buildDetailTextForAction(row.id, tile) ?? "") + frontierBuildDetailSuffix(tile),
      ...tileActionAvailability(
        ...chained(
          row.type,
          researched && hasFreeResourceSlots(state, row.type) && !occupied,
          !researched
            ? `Requires ${row.techName}`
            : occupied
              ? "Tile already has structure"
              : missingResourceSlotReason(state, row.type) ?? "Unavailable",
          `${deps.structureCostText(row.type)} • ${buildTimeLabel(economicBuildMsForState(state, row.type))} • ${row.effect}${upkeepSuffixFor(row.type)}`
        )
      )
    });
  }
  return out;
};
