import { RESOURCE_NETWORKS, TILE_SLOT_BOOST_STRUCTURES, isNetworkResource, networkBuildAction, type EconomicStructureType, type BuildableStructureType } from "@border-empires/shared";
import { economicBuildMsForState } from "../client-build-speed/client-build-speed.js";
import { buildTimeLabel } from "../client-relay-beacon-build-time/client-relay-beacon-build-time.js";
import { upkeepSuffixFor } from "../client-structure-upkeep-text/client-structure-upkeep-text.js";
import type { ClientState } from "../client-state/client-state.js";
import type { Tile, TileActionDef } from "../client-types.js";
import { hasFreeResourceSlots, missingResourceSlotReason } from "./client-resource-slot-gate.js";

type ResourceBuild = { type: EconomicStructureType; id: TileActionDef["id"]; name: string; tech: string; requirement: string; effect: string };
export interface ResourceBuildDeps {
  structureCostText: (type: BuildableStructureType) => string;
  buildDetailTextForAction: (id: TileActionDef["id"], tile: Tile) => string | undefined;
  availability: (type: BuildableStructureType, eligible: boolean, reason: string, cost: string) => [boolean, string, string];
}

export function resourceBuildActions(state: ClientState, tile: Tile, blocked: boolean, detailSuffix: string, deps: ResourceBuildDeps): TileActionDef[] {
  let build: ResourceBuild | undefined;
  if (isNetworkResource(tile.resource)) {
    const spec = RESOURCE_NETWORKS[tile.resource];
    build = { type: spec.building, id: networkBuildAction(tile.resource), name: spec.buildingName, tech: spec.tech,
      requirement: `Requires ${spec.tech.split("-").join(" ")}`, effect: spec.effect };
  } else if (tile.resource === "FARM") {
    build = { type: "HYDROGARDEN", id: "build_hydrogarden", name: "Hydrogarden", tech: "agriculture", requirement: "Requires Hyperfeed Seedstock Consignment", effect: `+${TILE_SLOT_BOOST_STRUCTURES.HYDROGARDEN} FOOD slot` };
  } else if (tile.resource === "UMBRITE") {
    build = { type: "UMBRITE_RIG", id: "build_umbrite_rig", name: "Umbrite Rig", tech: "leatherworking", requirement: "Requires Umbrite Rigging Module", effect: "+1 UMBRITE slot" };
  } else if (tile.resource === "TITANIUM" || tile.resource === "GEMS") {
    build = { type: "MINE", id: "build_mine", name: "Mine", tech: "mining", requirement: "Requires Prospector Crew", effect: `+1 ${tile.resource === "TITANIUM" ? "TITANIUM" : "CRYSTAL"} slot` };
  }
  if (!build) return [];
  const eligible = !blocked && state.techIds.includes(build.tech) && hasFreeResourceSlots(state, build.type);
  const reason = blocked ? "Tile already has structure" : !state.techIds.includes(build.tech) ? build.requirement : missingResourceSlotReason(state, build.type) ?? "Unavailable";
  const [enabled, disabledReason, cost] = deps.availability(build.type, eligible, reason,
    `${deps.structureCostText(build.type)} • ${buildTimeLabel(economicBuildMsForState(state, build.type))} • ${build.effect}${upkeepSuffixFor(build.type)}`);
  return [{ id: build.id, label: `Build ${build.name}`, detail: (deps.buildDetailTextForAction(build.id, tile) ?? "") + detailSuffix,
    disabled: !enabled, ...(enabled ? {} : { disabledReason }), cost }];
}
