import type { DomainTileState } from "@border-empires/game-domain";
import { emptyNetworkSiteCounts, NETWORK_RESOURCES, isNetworkResource, RESOURCE_NETWORKS, type NetworkSiteCounts } from "@border-empires/shared";

/** Count renewable output slots from eligible sites, once per existing economy/manpower cache rebuild. */
export function developedNetworkSites(
  tiles: Iterable<DomainTileState>, ownerId: string, dormant: ReadonlySet<string>, techIds?: ReadonlySet<string>
): NetworkSiteCounts {
  const counts = emptyNetworkSiteCounts();
  if (techIds && !NETWORK_RESOURCES.some(resource => techIds.has(RESOURCE_NETWORKS[resource].tech))) return counts;
  for (const tile of tiles) {
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED" || !isNetworkResource(tile.resource)) continue;
    const spec = RESOURCE_NETWORKS[tile.resource];
    if (tile.economicStructure?.type !== spec.building || tile.economicStructure.status !== "active" || tile.economicStructure.ownerId !== ownerId ||
        dormant.has(`${tile.x},${tile.y}`) || (techIds && !techIds.has(spec.tech))) continue;
    counts[tile.resource] += spec.slotsPerSite;
  }
  return counts;
}
