import type { DomainTileState } from "@border-empires/game-domain";
import { EMPIRE_INTEGRITY_ENABLED } from "@border-empires/shared";

import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { computeTownSupport } from "../town-support.js";

export type SettlementCandidateEvaluation = {
  score: number;
  strategic: boolean;
  economicallyInteresting: boolean;
  defensivelyCompact: boolean;
  supportsImmediatePlan: boolean;
  townSupportNeed: number;
};

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const resourceScore = (resource: DomainTileState["resource"] | undefined): number => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return 200;
    case "IRON":
      return 130;
    case "WOOD":
    case "FUR":
      return 120;
    case "GEMS":
      return 140;
    default:
      return 0;
  }
};

const adjacentTownSupportNeed = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>,
  assumedFrontierKeys: ReadonlySet<string>
): number => {
  let need = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighborKey = tileKeyOf(nx, ny);
    const neighbor = tiles.get(neighborKey);
    if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED" || !neighbor.town) return;
    if (assumedFrontierKeys.has(neighborKey)) return;
    if (neighbor.town.populationTier === "SETTLEMENT") return;
    const storedMax = neighbor.town.supportMax;
    const storedCurrent = neighbor.town.supportCurrent;
    if (typeof storedMax === "number" && typeof storedCurrent === "number") {
      need += Math.max(0, storedMax - storedCurrent);
      return;
    }
    const { supportMax, supportCurrent } = computeTownSupport(playerId, neighbor.x, neighbor.y, tiles);
    need += Math.max(0, supportMax - supportCurrent);
  });
  return need;
};

const nearbyOwnedTownCount = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): number => {
  let count = 0;
  const visited = new Set<string>([tileKeyOf(tile.x, tile.y)]);
  let frontier = [tileKeyOf(tile.x, tile.y)];
  for (let depth = 0; depth < 2; depth += 1) {
    const nextFrontier: string[] = [];
    for (const currentKey of frontier) {
      const current = tiles.get(currentKey);
      if (!current) continue;
      forEachFrontierNeighbor(current.x, current.y, (nx, ny) => {
        const neighborKey = tileKeyOf(nx, ny);
        if (visited.has(neighborKey)) return;
        visited.add(neighborKey);
        const neighbor = tiles.get(neighborKey);
        if (!neighbor) return;
        nextFrontier.push(neighborKey);
        if (neighbor.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town) count += 1;
      });
    }
    frontier = nextFrontier;
  }
  return count;
};

const ownedAdjacencyMetrics = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>,
  assumedFrontierKeys: ReadonlySet<string>
): {
  ownedNeighbors: number;
  settledNeighbors: number;
  frontierNeighbors: number;
  exposedSides: number;
  hostileInterest: number;
} => {
  let ownedNeighbors = 0;
  let settledNeighbors = 0;
  let frontierNeighbors = 0;
  let exposedSides = 0;
  let hostileInterest = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    const neighborKey = tileKeyOf(nx, ny);
    const neighbor = tiles.get(neighborKey);
    const assumedOwned = assumedFrontierKeys.has(neighborKey);
    const ownerId = assumedOwned ? playerId : neighbor?.ownerId;
    const ownershipState = assumedOwned ? "FRONTIER" : neighbor?.ownershipState;
    if (!neighbor || neighbor.terrain !== "LAND") {
      exposedSides += 1;
      return;
    }
    if (ownerId === playerId) {
      ownedNeighbors += 1;
      if (ownershipState === "SETTLED") settledNeighbors += 1;
      if (ownershipState === "FRONTIER") frontierNeighbors += 1;
      return;
    }
    exposedSides += 1;
    if (ownerId && ownerId !== playerId) {
      if (neighbor.town) hostileInterest += 35;
      if (neighbor.dockId) hostileInterest += 28;
      hostileInterest += Math.max(0, resourceScore(neighbor.resource) / 2);
    }
  });
  return { ownedNeighbors, settledNeighbors, frontierNeighbors, exposedSides, hostileInterest };
};

export const evaluateSettlementCandidate = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>,
  assumedFrontierKeys: ReadonlySet<string> = new Set()
): SettlementCandidateEvaluation => {
  const tileKey = tileKeyOf(tile.x, tile.y);
  const assumedOwned = assumedFrontierKeys.has(tileKey);
  const ownerId = assumedOwned ? playerId : tile.ownerId;
  const ownershipState = assumedOwned ? "FRONTIER" : tile.ownershipState;
  if (tile.terrain !== "LAND" || ownerId !== playerId || ownershipState !== "FRONTIER") {
    return {
      score: Number.NEGATIVE_INFINITY,
      strategic: false,
      economicallyInteresting: false,
      defensivelyCompact: false,
      supportsImmediatePlan: false,
      townSupportNeed: 0
    };
  }

  const townSupportNeed = adjacentTownSupportNeed(playerId, tile, tiles, assumedFrontierKeys);
  const nearbyTownCount = nearbyOwnedTownCount(playerId, tile, tiles);
  const adjacency = ownedAdjacencyMetrics(playerId, tile, tiles, assumedFrontierKeys);
  const intrinsicEconomicValue = Boolean(tile.town || tile.dockId || tile.resource);
  // Frontier tiles have defMult=0 in real combat (packages/shared/src/frontier-combat.ts:21)
  // — only SETTLED neighbors actually defend. Frontier neighbors get a small clustering
  // bonus (territory shape) but not a real defensive credit.
  const defensiveShapeValue =
    adjacency.settledNeighbors * 28 +
    adjacency.frontierNeighbors * 4 -
    adjacency.exposedSides * 14 +
    (adjacency.settledNeighbors >= 2 ? 24 : 0) +
    (adjacency.exposedSides <= 1 ? 18 : 0);
  const townConnectionSignal =
    nearbyTownCount >= 2
      ? 110 + adjacency.settledNeighbors * 16
      : nearbyTownCount === 1 && adjacency.settledNeighbors >= 2
        ? 45
        : 0;
  const economicallyInteresting =
    intrinsicEconomicValue || townSupportNeed > 0 || townConnectionSignal >= 90;
  const defensivelyCompact = adjacency.settledNeighbors >= 2 && adjacency.exposedSides <= 1;
  const strategic = economicallyInteresting || adjacency.hostileInterest >= 35 || defensiveShapeValue >= 26;

  let score = 0;
  if (tile.town) score += 1_000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource);
  score += townSupportNeed * 90;
  score += adjacency.hostileInterest + defensiveShapeValue + townConnectionSignal;
  if (tile.resource === "FARM" || tile.resource === "FISH") score += 40;
  score += EMPIRE_INTEGRITY_ENABLED && defensivelyCompact ? 20 : 0;
  if (!economicallyInteresting && !strategic) score -= 120;
  if (adjacency.ownedNeighbors <= 1 && !economicallyInteresting) score -= 70;
  if (adjacency.exposedSides >= 3 && !economicallyInteresting && adjacency.hostileInterest < 25) score -= 55;
  score -= Math.abs(tile.x) * 0.0001 + Math.abs(tile.y) * 0.0001;

  return {
    score,
    strategic,
    economicallyInteresting,
    defensivelyCompact,
    supportsImmediatePlan:
      economicallyInteresting || defensivelyCompact || townSupportNeed > 0 || townConnectionSignal >= 70 || score >= 45,
    townSupportNeed
  };
};
