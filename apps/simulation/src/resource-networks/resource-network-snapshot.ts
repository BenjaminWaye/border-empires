import type { DomainTileState } from "@border-empires/game-domain";
import { allocateNetworkCredit, type NetworkCreditAllocation } from "./resource-network-credit.js";
import { developedNetworkSites } from "./resource-networks.js";

/** One owned-tile traversal per snapshot owner, shared by all of their town displays. */
export function snapshotNetworkCredit(
  settledByOwner: ReadonlyMap<string, readonly DomainTileState[]>,
  players: Iterable<{ id: string; techIds: Iterable<string>; effectiveNetworkSupply?: import("@border-empires/shared").NetworkSiteCounts }>,
  dormantByOwner: ReadonlyMap<string, ReadonlySet<string>>,
  tiles: ReadonlyMap<string, DomainTileState>, fedTownsByOwner: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, NetworkCreditAllocation> {
  const counts = new Map<string, NetworkCreditAllocation>();
  for (const player of players) counts.set(player.id, allocateNetworkCredit(player.id, tiles, fedTownsByOwner.get(player.id) ?? new Set(), dormantByOwner.get(player.id) ?? new Set(), player.effectiveNetworkSupply ?? developedNetworkSites(
    settledByOwner.get(player.id) ?? [], player.id, dormantByOwner.get(player.id) ?? new Set(), new Set(player.techIds)
  )));
  return counts;
}
