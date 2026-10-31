import { NETWORK_RESOURCES, RESOURCE_NETWORKS, type BuildableStructureType } from "@border-empires/shared";

export type PlannerOwnedStructureCounts = Partial<Record<BuildableStructureType, number>>;

/** Owned frontier resource-network installations (Resin Extractor, Implant Foundry, ...), any status. */
export const ownedNetworkInstallationCount = (counts: PlannerOwnedStructureCounts | undefined): number =>
  counts ? NETWORK_RESOURCES.reduce((sum, resource) => sum + (counts[RESOURCE_NETWORKS[resource].building as BuildableStructureType] ?? 0), 0) : 0;
