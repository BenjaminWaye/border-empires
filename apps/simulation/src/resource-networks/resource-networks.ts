import type { DomainTileState } from "@border-empires/game-domain";
import { emptyNetworkSiteCounts, NETWORK_RESOURCES, isNetworkResource, RESOURCE_NETWORKS, type NetworkSiteCounts } from "@border-empires/shared";

/**
 * Count renewable output slots from eligible sites, once per existing economy/manpower cache rebuild.
 * A site's tech counts when researched or, for an AFC-module tech (Reclamation Works' Industrial
 * Tooling), when the caller's installedModules holds it -- the same rule that let it be built
 * (apps/simulation/src/afc-module-build-access/).
 */
export function developedNetworkSites(
  tiles: Iterable<DomainTileState>, ownerId: string, dormant: ReadonlySet<string>, techIds?: ReadonlySet<string>, installedModules?: ReadonlySet<string>
): NetworkSiteCounts {
  const counts = emptyNetworkSiteCounts();
  const usable = (tech: string): boolean => !techIds || techIds.has(tech) || Boolean(installedModules?.has(tech));
  if (!NETWORK_RESOURCES.some(resource => usable(RESOURCE_NETWORKS[resource].tech))) return counts;
  for (const tile of tiles) {
    if (tile.ownerId !== ownerId || tile.ownershipState !== "SETTLED" || !isNetworkResource(tile.resource)) continue;
    const spec = RESOURCE_NETWORKS[tile.resource];
    if (tile.economicStructure?.type !== spec.building || tile.economicStructure.status !== "active" || tile.economicStructure.ownerId !== ownerId ||
        dormant.has(`${tile.x},${tile.y}`) || !usable(spec.tech)) continue;
    counts[tile.resource] += 1;
  }
  return counts;
}
