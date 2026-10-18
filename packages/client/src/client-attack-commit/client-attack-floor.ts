import { FRONTIER_ATTACK_MUSTER_COST, requiredMusterForTarget } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export function attackFloorForPlayer(state: { domainIds?: readonly string[] }, tile: Tile | undefined): number {
  if (tile?.ownershipState === "FRONTIER") return FRONTIER_ATTACK_MUSTER_COST;
  return requiredMusterForTarget(tile, state.domainIds);
}
