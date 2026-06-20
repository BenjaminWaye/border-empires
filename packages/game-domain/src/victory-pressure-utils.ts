import type { ResourceType } from "@border-empires/shared";

export const VICTORY_RESOURCE_TYPES: ResourceType[] = ["FARM", "WOOD", "IRON", "GEMS", "FISH", "FUR"];

export type ResourceMonopolyLeader = {
  leaderPlayerId?: string;
  bestOwned: number;
  bestTotal: number;
  bestResource?: ResourceType;
  bestShare: number;
  contested: boolean;
};

export const formatVictoryShare = (share: number): string => `${Math.round(share * 100)}%`;

export const resourceMonopolyProgressLabel = (leader: ResourceMonopolyLeader): string => {
  if (leader.contested) return `Contested at ${Math.round(leader.bestShare * 100)}% share`;
  return leader.bestResource ? `${leader.bestOwned}/${leader.bestTotal} ${leader.bestResource}` : "No resource leader";
};

export const resourceMonopolyThresholdLabel = (requiredShare: number): string =>
  `Need ${formatVictoryShare(requiredShare)} control of one resource type`;

export const resourceMonopolyConditionMet = (leader: ResourceMonopolyLeader, requiredShare: number): boolean =>
  Boolean(
    leader.leaderPlayerId &&
      leader.bestResource &&
      leader.bestTotal > 0 &&
      leader.bestOwned >= Math.ceil(leader.bestTotal * requiredShare)
  );

export const maritimeSupremacyProgressLabel = (ownedDocks: number, targetDocks: number): string =>
  `${ownedDocks}/${targetDocks} docks`;

export const maritimeSupremacyThresholdLabel = (requiredShare: number, targetDocks: number): string =>
  `Need ${targetDocks} settled docks (${formatVictoryShare(requiredShare)} of world docks)`;

export const diplomaticDominanceProgressLabel = (input: {
  blocControlledTiles: number;
  targetTiles: number;
  leaderControlledTiles: number;
  blocMemberCount: number;
}): string =>
  `${input.blocControlledTiles}/${input.targetTiles} alliance-controlled land · leader ${input.leaderControlledTiles} tiles · ${input.blocMemberCount} member${input.blocMemberCount === 1 ? "" : "s"}`;

export const diplomaticDominanceThresholdLabel = (requiredShare: number, targetTiles: number): string =>
  `Need ${targetTiles} alliance-controlled land tiles (${formatVictoryShare(requiredShare)}) and largest member status`;

export const resourceMonopolyLeader = (
  ownedResourceCountsByPlayerId: Map<string, Record<ResourceType, number>>,
  totalResourceCounts: Record<ResourceType, number>
): ResourceMonopolyLeader => {
  let leaderPlayerId: string | undefined;
  let bestOwned = 0;
  let bestTotal = 0;
  let bestResource: ResourceType | undefined;
  let bestShare = 0;
  let contested = false;
  for (const [candidatePlayerId, owned] of ownedResourceCountsByPlayerId) {
    for (const resource of VICTORY_RESOURCE_TYPES) {
      const total = totalResourceCounts[resource] ?? 0;
      if (total <= 0) continue;
      const value = owned[resource] ?? 0;
      const share = value / total;
      if (share > bestShare || (share === bestShare && value > bestOwned)) {
        leaderPlayerId = candidatePlayerId;
        bestOwned = value;
        bestTotal = total;
        bestResource = resource;
        bestShare = share;
        contested = false;
        continue;
      }
      if (share === bestShare && value === bestOwned && value > 0 && candidatePlayerId !== leaderPlayerId) contested = true;
    }
  }
  if (contested) return { bestOwned, bestTotal, bestShare, contested };
  const result: ResourceMonopolyLeader = {
    bestOwned,
    bestTotal,
    bestShare,
    contested
  };
  if (leaderPlayerId) result.leaderPlayerId = leaderPlayerId;
  if (bestResource) result.bestResource = bestResource;
  return result;
};
