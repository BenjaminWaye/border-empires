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

type FrontierSelection = {
  from: PlannerTile;
  target: PlannerTile;
  score: number;
};

export type FrontierAnalysis = {
  attack?: FrontierSelection;
  expand?: FrontierSelection;
  frontierEnemyTargetCount: number;
  frontierNeutralTargetCount: number;
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

const isBetterSelection = (
  next: FrontierSelection,
  current: FrontierSelection | undefined
): boolean =>
  !current ||
  next.score > current.score ||
  (next.score === current.score &&
    (sortTiles(next.from, current.from) < 0 ||
      (sortTiles(next.from, current.from) === 0 && sortTiles(next.target, current.target) < 0)));

const createFrontierCommand = (
  selection: FrontierSelection,
  playerId: string,
  clientSeq: number,
  issuedAt: number,
  sessionPrefix: "ai-runtime" | "system-runtime",
  type: "ATTACK" | "EXPAND"
): CommandEnvelope => ({
  commandId: `${sessionPrefix}-${playerId}-${clientSeq}-${issuedAt}`,
  sessionId: `${sessionPrefix}:${playerId}`,
  playerId,
  clientSeq,
  issuedAt,
  type,
  payloadJson: JSON.stringify({
    fromX: selection.from.x,
    fromY: selection.from.y,
    toX: selection.target.x,
    toY: selection.target.y
  })
});

export const analyzeOwnedFrontierTargetsFromLookup = (
  tilesByKey: PlannerTileLookup,
  ownedTiles: Iterable<PlannerTile>,
  playerId: string,
  affordability: FrontierAffordability = {}
): FrontierAnalysis => {
  const canAttack = affordability.canAttack ?? true;
  const canExpand = affordability.canExpand ?? true;
  const dockLinksByDockTileKey = affordability.dockLinksByDockTileKey;
  const scoreByTargetKey = new Map<string, number>();
  const enemyTargets = new Set<string>();
  const neutralTargets = new Set<string>();
  let bestAttack: FrontierSelection | undefined;
  let bestExpand: FrontierSelection | undefined;

  const candidateKeysForOrigin = (from: PlannerTile): readonly string[] => {
    if (!from.dockId || !dockLinksByDockTileKey) return frontierNeighborKeys(from.x, from.y);
    const candidateKeys = new Set(frontierNeighborKeys(from.x, from.y));
    for (const tileKey of dockCrossingCandidateTileKeys(`${from.x},${from.y}`, dockLinksByDockTileKey)) {
      candidateKeys.add(tileKey);
    }
    return [...candidateKeys];
  };

  const targetScore = (targetKey: string, target: PlannerTile): number => {
    const cachedScore = scoreByTargetKey.get(targetKey);
    if (cachedScore !== undefined) return cachedScore;
    const score = frontierTargetScore(tilesByKey, target);
    scoreByTargetKey.set(targetKey, score);
    return score;
  };

  for (const from of ownedTiles) {
    for (const targetKey of candidateKeysForOrigin(from)) {
      const target = tilesByKey.get(targetKey);
      if (!target || target.terrain !== "LAND" || target.ownerId === playerId) continue;
      if (target.ownerId) {
        enemyTargets.add(targetKey);
        if (!canAttack) continue;
        const candidate = { from, target, score: targetScore(targetKey, target) };
        if (isBetterSelection(candidate, bestAttack)) bestAttack = candidate;
        continue;
      }
      neutralTargets.add(targetKey);
      if (!canExpand) continue;
      const candidate = { from, target, score: targetScore(targetKey, target) };
      if (isBetterSelection(candidate, bestExpand)) bestExpand = candidate;
    }
  }

  return {
    ...(bestAttack ? { attack: bestAttack } : {}),
    ...(bestExpand ? { expand: bestExpand } : {}),
    frontierEnemyTargetCount: enemyTargets.size,
    frontierNeutralTargetCount: neutralTargets.size
  };
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
  const analysis = analyzeOwnedFrontierTargetsFromLookup(tilesByKey, ownedTiles, playerId, affordability);
  if (analysis.attack) {
    return createFrontierCommand(analysis.attack, playerId, clientSeq, issuedAt, sessionPrefix, "ATTACK");
  }
  if (analysis.expand) {
    return createFrontierCommand(analysis.expand, playerId, clientSeq, issuedAt, sessionPrefix, "EXPAND");
  }
  return undefined;
};
