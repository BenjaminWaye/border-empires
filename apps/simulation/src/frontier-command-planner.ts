import type { CommandEnvelope } from "@border-empires/sim-protocol";

import { dockCrossingCandidateTileKeys } from "./dock-network.js";
import { frontierNeighborKeys } from "./frontier-topology.js";

type PlannerTile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  ownerId?: string | undefined;
  resource?: string | undefined;
  dockId?: string | undefined;
  town?: unknown;
};

type PlannerTileLookup = ReadonlyMap<string, PlannerTile>;
type FrontierAffordability = {
  canAttack?: boolean;
  canExpand?: boolean;
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>;
};

const sortTiles = (
  left: { x: number; y: number },
  right: { x: number; y: number }
): number => (left.x - right.x) || (left.y - right.y);

const resourceScore = (resource: string | undefined): number => {
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

const adjacentLandCount = (tilesByKey: PlannerTileLookup, tile: PlannerTile): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce((count, neighborKey) => count + (tilesByKey.get(neighborKey)?.terrain === "LAND" ? 1 : 0), 0);

const frontierTargetScore = (tilesByKey: PlannerTileLookup, tile: PlannerTile): number => {
  let score = 0;
  if (tile.town) score += 1_000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource);
  score += adjacentLandCount(tilesByKey, tile) * 20;
  if (!tile.resource && !tile.town && !tile.dockId) score -= 40;
  return score;
};

export const chooseNextOwnedFrontierCommandFromTiles = (
  tiles: Iterable<PlannerTile>,
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  sessionPrefix: "ai-runtime" | "system-runtime",
  affordability: FrontierAffordability = {}
): CommandEnvelope | undefined => {
  const tileList = [...tiles];
  const tilesByKey = new Map(tileList.map((tile) => [`${tile.x},${tile.y}`, tile] as const));
  const ownedTiles = tileList.filter((tile) => tile.ownerId === playerId).sort(sortTiles);
  return chooseNextOwnedFrontierCommandFromLookup(
    tilesByKey,
    ownedTiles,
    playerId,
    clientSeq,
    issuedAt,
    sessionPrefix,
    affordability
  );
};

export const chooseNextOwnedFrontierCommandFromLookup = (
  tilesByKey: PlannerTileLookup,
  ownedTiles: Iterable<PlannerTile>,
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  sessionPrefix: "ai-runtime" | "system-runtime",
  affordability: FrontierAffordability = {}
): CommandEnvelope | undefined => {
  const canAttack = affordability.canAttack ?? true;
  const canExpand = affordability.canExpand ?? true;
  const dockLinksByDockTileKey = affordability.dockLinksByDockTileKey;
  const candidateKeysForOrigin = (from: PlannerTile): string[] => {
    const candidateKeys = new Set(frontierNeighborKeys(from.x, from.y));
    if (from.dockId && dockLinksByDockTileKey) {
      for (const tileKey of dockCrossingCandidateTileKeys(`${from.x},${from.y}`, dockLinksByDockTileKey)) {
        candidateKeys.add(tileKey);
      }
    }
    return [...candidateKeys];
  };
  let bestAttack:
    | {
        from: PlannerTile;
        target: PlannerTile;
        score: number;
      }
    | undefined;
  for (const from of ownedTiles) {
    for (const targetKey of candidateKeysForOrigin(from)) {
      const target = tilesByKey.get(targetKey);
      if (!target) continue;
      if (target.terrain !== "LAND") continue;
      if (!target.ownerId || target.ownerId === playerId) continue;
      if (!canAttack) continue;
      const score = frontierTargetScore(tilesByKey, target);
      if (
        !bestAttack ||
        score > bestAttack.score ||
        (score === bestAttack.score &&
          (sortTiles(from, bestAttack.from) < 0 ||
            (sortTiles(from, bestAttack.from) === 0 && sortTiles(target, bestAttack.target) < 0)))
      ) {
        bestAttack = { from, target, score };
      }
    }
  }
  if (bestAttack) {
    return {
      commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
      sessionId: `${sessionPrefix}:${playerId}`,
      playerId,
      clientSeq,
      issuedAt,
      type: "ATTACK",
      payloadJson: JSON.stringify({
        fromX: bestAttack.from.x,
        fromY: bestAttack.from.y,
        toX: bestAttack.target.x,
        toY: bestAttack.target.y
      })
    };
  }

  let bestExpand:
    | {
        from: PlannerTile;
        target: PlannerTile;
        score: number;
      }
    | undefined;
  for (const from of ownedTiles) {
    for (const targetKey of candidateKeysForOrigin(from)) {
      const target = tilesByKey.get(targetKey);
      if (!target || target.ownerId) continue;
      if (target.terrain !== "LAND") continue;
      if (!canExpand) continue;
      const score = frontierTargetScore(tilesByKey, target);
      if (
        !bestExpand ||
        score > bestExpand.score ||
        (score === bestExpand.score &&
          (sortTiles(from, bestExpand.from) < 0 ||
            (sortTiles(from, bestExpand.from) === 0 && sortTiles(target, bestExpand.target) < 0)))
      ) {
        bestExpand = { from, target, score };
      }
    }
  }
  if (bestExpand) {
    return {
      commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
      sessionId: `${sessionPrefix}:${playerId}`,
      playerId,
      clientSeq,
      issuedAt,
      type: "EXPAND",
      payloadJson: JSON.stringify({
        fromX: bestExpand.from.x,
        fromY: bestExpand.from.y,
        toX: bestExpand.target.x,
        toY: bestExpand.target.y
      })
    };
  }

  return undefined;
};
