import type { DomainTileState } from "@border-empires/game-domain";
import type { NetworkSiteCounts } from "@border-empires/shared";
import { developedNetworkSites } from "./resource-networks.js";

/** One owned-tile traversal per snapshot owner, shared by all of their town displays. */
export function snapshotNetworkSites(
  settledByOwner: ReadonlyMap<string, readonly DomainTileState[]>,
  players: Iterable<{ id: string; techIds: Iterable<string> }>,
  dormantByOwner: ReadonlyMap<string, ReadonlySet<string>>
): Map<string, NetworkSiteCounts> {
  const counts = new Map<string, NetworkSiteCounts>();
  for (const player of players) counts.set(player.id, developedNetworkSites(
    settledByOwner.get(player.id) ?? [], player.id, dormantByOwner.get(player.id) ?? new Set(), new Set(player.techIds)
  ));
  return counts;
}
