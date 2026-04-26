import type { DomainTileState } from "@border-empires/game-domain";

import { frontierNeighborKeys } from "./frontier-topology.js";

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
      return 180;
    case "IRON":
    case "WOOD":
    case "FUR":
      return 120;
    case "GEMS":
    case "OIL":
      return 90;
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
  for (const neighborKey of frontierNeighborKeys(tile.x, tile.y)) {
    const neighbor = tiles.get(neighborKey);
    if (!neighbor || neighbor.ownerId !== playerId || neighbor.ownershipState !== "SETTLED" || !neighbor.town) continue;
    if (assumedFrontierKeys.has(neighborKey)) continue;
    const supportMax = Math.max(0, neighbor.town.supportMax ?? 0);
    const supportCurrent = Math.max(0, neighbor.town.supportCurrent ?? 0);
    need += Math.max(0, supportMax - supportCurrent);
  }
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
      for (const neighborKey of frontierNeighborKeys(current.x, current.y)) {
        if (visited.has(neighborKey)) continue;
        visited.add(neighborKey);
        const neighbor = tiles.get(neighborKey);
        if (!neighbor) continue;
        nextFrontier.push(neighborKey);
        if (neighbor.ownerId === playerId && neighbor.ownershipState === "SETTLED" && neighbor.town) count += 1;
      }
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
  for (const neighborKey of frontierNeighborKeys(tile.x, tile.y)) {
    const neighbor = tiles.get(neighborKey);
    const assumedOwned = assumedFrontierKeys.has(neighborKey);
    const ownerId = assumedOwned ? playerId : neighbor?.ownerId;
    const ownershipState = assumedOwned ? "FRONTIER" : neighbor?.ownershipState;
    if (!neighbor || neighbor.terrain !== "LAND") {
      exposedSides += 1;
      continue;
    }
    if (ownerId === playerId) {
      ownedNeighbors += 1;
      if (ownershipState === "SETTLED") settledNeighbors += 1;
      if (ownershipState === "FRONTIER") frontierNeighbors += 1;
      continue;
    }
    exposedSides += 1;
    if (ownerId && ownerId !== playerId) {
      if (neighbor.town) hostileInterest += 35;
      if (neighbor.dockId) hostileInterest += 28;
      hostileInterest += Math.max(0, resourceScore(neighbor.resource) / 2);
    }
  }
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
  const defensiveShapeValue =
    adjacency.settledNeighbors * 22 +
    adjacency.frontierNeighbors * 10 -
    adjacency.exposedSides * 14 +
    (adjacency.ownedNeighbors >= 3 ? 24 : 0) +
    (adjacency.exposedSides <= 1 ? 18 : 0);
  const townConnectionSignal =
    nearbyTownCount >= 2
      ? 110 + adjacency.settledNeighbors * 16
      : nearbyTownCount === 1 && adjacency.settledNeighbors >= 2
        ? 45
        : 0;
  const economicallyInteresting =
    intrinsicEconomicValue || townSupportNeed > 0 || townConnectionSignal >= 90;
  const defensivelyCompact = adjacency.ownedNeighbors >= 3 && adjacency.exposedSides <= 1;
  const strategic = economicallyInteresting || adjacency.hostileInterest >= 35 || defensiveShapeValue >= 26;

  let score = 0;
  if (tile.town) score += 1_000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource);
  score += townSupportNeed * 90;
  score += adjacency.hostileInterest + defensiveShapeValue + townConnectionSignal;
  if (tile.resource === "FARM" || tile.resource === "FISH") score += 40;
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

export const settlementSupportNeedForTile = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): number => evaluateSettlementCandidate(playerId, tile, tiles).townSupportNeed;

export const hasStrategicSettlementValue = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): boolean => evaluateSettlementCandidate(playerId, tile, tiles).strategic;

export const rankSettlementTile = (
  playerId: string,
  tile: DomainTileState,
  tiles: ReadonlyMap<string, DomainTileState>
): number => evaluateSettlementCandidate(playerId, tile, tiles).score;

const isBetterSettlementCandidate = (
  candidate: DomainTileState,
  candidateScore: number,
  current: DomainTileState | undefined,
  currentScore: number
): boolean => {
  if (!current) return true;
  if (candidateScore !== currentScore) return candidateScore > currentScore;
  if (candidate.x !== current.x) return candidate.x < current.x;
  return candidate.y < current.y;
};

export const chooseBestStrategicSettlementTile = (
  playerId: string,
  candidates: Iterable<DomainTileState>,
  tiles: ReadonlyMap<string, DomainTileState>,
  isPending?: (tile: DomainTileState) => boolean
): DomainTileState | undefined => {
  let bestTile: DomainTileState | undefined;
  let bestScore = Number.NEGATIVE_INFINITY;
  for (const tile of candidates) {
    if (tile.terrain !== "LAND" || tile.ownerId !== playerId) continue;
    if (isPending?.(tile)) continue;
    const evaluation = evaluateSettlementCandidate(playerId, tile, tiles);
    if (!evaluation.strategic) continue;
    if (isBetterSettlementCandidate(tile, evaluation.score, bestTile, bestScore)) {
      bestTile = tile;
      bestScore = evaluation.score;
    }
  }
  return bestTile;
};
