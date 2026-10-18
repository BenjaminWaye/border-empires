import { defendingFortVariant, FRONTIER_ATTACK_MUSTER_COST, requiredMusterForTarget } from "@border-empires/shared";
import type { Tile } from "../client-types.js";

export function attackFloorForPlayer(state: { domainIds?: readonly string[] }, tile: Tile | undefined): number {
  if (tile?.ownershipState === "FRONTIER") return FRONTIER_ATTACK_MUSTER_COST;
  const factor = defendingFortVariant(tile?.fort) && state.domainIds?.includes("afc-vanguard-4") ? 0.5 : 1;
  return Math.max(1, Math.ceil(requiredMusterForTarget(tile) * factor));
}
