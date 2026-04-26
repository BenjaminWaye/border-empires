import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { SettlementCandidateEvaluation } from "./ai-settlement-priority.js";
import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { dockCrossingCandidateTileKeys } from "./dock-network.js";
import { frontierNeighborKeys } from "./frontier-topology.js";

type PlannerTile = {
  x: number;
  y: number;
  terrain: "LAND" | "SEA" | "MOUNTAIN";
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
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

export type FrontierClass = "economic" | "scaffold" | "scout" | "waste";

type FrontierSelection = {
  from: PlannerTile;
  target: PlannerTile;
  score: number;
  frontierClass?: FrontierClass;
};

export type FrontierAnalysis = {
  attack?: FrontierSelection;
  expand?: FrontierSelection;
  economicExpand?: FrontierSelection;
  scaffoldExpand?: FrontierSelection;
  scoutExpand?: FrontierSelection;
  frontierEnemyTargetCount: number;
  frontierNeutralTargetCount: number;
  frontierOpportunityEconomic: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
};

const sortTiles = (left: { x: number; y: number }, right: { x: number; y: number }): number =>
  (left.x - right.x) || (left.y - right.y);

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

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

const strategicFrontierTargetScore = (tile: PlannerTile): number => {
  let score = 0;
  if (tile.town) score += 1_000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource);
  if (!tile.resource && !tile.town && !tile.dockId) score -= 40;
  return score;
};

const ownedNeighborCount = (tilesByKey: PlannerTileLookup, tile: PlannerTile, playerId: string): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce(
    (count, neighborKey) => count + (tilesByKey.get(neighborKey)?.ownerId === playerId ? 1 : 0),
    0
  );

const coastlineDiscoveryValue = (tilesByKey: PlannerTileLookup, tile: PlannerTile): number =>
  frontierNeighborKeys(tile.x, tile.y).reduce(
    (score, neighborKey) => score + (tilesByKey.get(neighborKey)?.terrain === "SEA" ? 18 : 0),
    0
  );

const candidateKeysForOrigin = (
  from: PlannerTile,
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>
): string[] => {
  const candidateKeys = new Set(frontierNeighborKeys(from.x, from.y));
  if (from.dockId && dockLinksByDockTileKey) {
    for (const tileKey of dockCrossingCandidateTileKeys(tileKeyOf(from.x, from.y), dockLinksByDockTileKey)) {
      candidateKeys.add(tileKey);
    }
  }
  return [...candidateKeys];
};

const buildDomainTileLookup = (tilesByKey: PlannerTileLookup): ReadonlyMap<string, import("@border-empires/game-domain").DomainTileState> =>
  tilesByKey as ReadonlyMap<string, import("@border-empires/game-domain").DomainTileState>;

const scoutExpandScore = (
  tilesByKey: PlannerTileLookup,
  from: PlannerTile,
  target: PlannerTile,
  playerId: string,
  currentReachableLandKeys: ReadonlySet<string>,
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>
): number => {
  const nextStepCandidateKeys = new Set(candidateKeysForOrigin(target, dockLinksByDockTileKey));
  nextStepCandidateKeys.delete(tileKeyOf(from.x, from.y));
  nextStepCandidateKeys.delete(tileKeyOf(target.x, target.y));
  let nextStepNonOwnedCount = 0;
  let novelFrontierCount = 0;
  let novelStrategicCount = 0;
  for (const nextStepKey of nextStepCandidateKeys) {
    const nextStepTile = tilesByKey.get(nextStepKey);
    if (!nextStepTile || nextStepTile.terrain !== "LAND" || nextStepTile.ownerId === playerId) continue;
    nextStepNonOwnedCount += 1;
    if (!currentReachableLandKeys.has(nextStepKey)) {
      novelFrontierCount += 1;
      if (nextStepTile.resource || nextStepTile.dockId || nextStepTile.town) novelStrategicCount += 1;
    }
  }
  return (
    novelStrategicCount * 220 +
    novelFrontierCount * 70 +
    nextStepNonOwnedCount * 15 +
    coastlineDiscoveryValue(tilesByKey, target) -
    ownedNeighborCount(tilesByKey, target, playerId) * 25 +
    (from.ownershipState === "FRONTIER" ? 10 : 0)
  );
};

const classifyNeutralOpportunity = (
  target: PlannerTile,
  settlementEvaluation: SettlementCandidateEvaluation,
  scoutScore: number
): FrontierClass => {
  if (target.town || target.dockId || target.resource) return "economic";
  if (settlementEvaluation.supportsImmediatePlan && settlementEvaluation.score >= 45) return "scaffold";
  if (scoutScore >= 30) return "scout";
  return "waste";
};

const selectionScoreForClass = (
  frontierClass: FrontierClass,
  target: PlannerTile,
  settlementEvaluation: SettlementCandidateEvaluation,
  scoutScore: number
): number => {
  const strategicScore = strategicFrontierTargetScore(target);
  if (frontierClass === "economic") return 260 + strategicScore + settlementEvaluation.score * 0.25;
  if (frontierClass === "scaffold") return 180 + settlementEvaluation.score;
  if (frontierClass === "scout") return 120 + scoutScore;
  return 50 + scoutScore + Math.max(0, settlementEvaluation.score);
};

const isBetterSelection = (next: FrontierSelection, current: FrontierSelection | undefined): boolean =>
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
  const domainTilesByKey = buildDomainTileLookup(tilesByKey);
  const ownedTileList = [...ownedTiles].sort(sortTiles);
  const currentReachableLandKeys = new Set<string>();
  let bestAttack: FrontierSelection | undefined;
  let bestExpand: FrontierSelection | undefined;
  let bestEconomicExpand: FrontierSelection | undefined;
  let bestScaffoldExpand: FrontierSelection | undefined;
  let bestScoutExpand: FrontierSelection | undefined;
  let frontierOpportunityEconomic = 0;
  let frontierOpportunityScout = 0;
  let frontierOpportunityScaffold = 0;
  let frontierOpportunityWaste = 0;

  for (const from of ownedTileList) {
    for (const candidateKey of candidateKeysForOrigin(from, dockLinksByDockTileKey)) {
      const target = tilesByKey.get(candidateKey);
      if (!target || target.terrain !== "LAND" || target.ownerId === playerId) continue;
      currentReachableLandKeys.add(candidateKey);
    }
  }

  for (const from of ownedTileList) {
    for (const targetKey of candidateKeysForOrigin(from, dockLinksByDockTileKey)) {
      const target = tilesByKey.get(targetKey);
      if (!target || target.terrain !== "LAND" || target.ownerId === playerId) continue;
      if (target.ownerId) {
        enemyTargets.add(targetKey);
        if (!canAttack) continue;
        const cachedScore = scoreByTargetKey.get(targetKey);
        const score =
          cachedScore ??
          (strategicFrontierTargetScore(target) +
            (target.ownershipState === "FRONTIER" ? 120 : 0) +
            ownedNeighborCount(tilesByKey, target, playerId) * 95 +
            coastlineDiscoveryValue(tilesByKey, target) * 0.35);
        scoreByTargetKey.set(targetKey, score);
        const candidate = { from, target, score };
        if (isBetterSelection(candidate, bestAttack)) bestAttack = candidate;
        continue;
      }

      neutralTargets.add(targetKey);
      if (!canExpand) continue;
      const settlementEvaluation = evaluateSettlementCandidate(
        playerId,
        target as import("@border-empires/game-domain").DomainTileState,
        domainTilesByKey,
        new Set([targetKey])
      );
      const scoutScore = scoutExpandScore(tilesByKey, from, target, playerId, currentReachableLandKeys, dockLinksByDockTileKey);
      const frontierClass = classifyNeutralOpportunity(target, settlementEvaluation, scoutScore);
      const score = selectionScoreForClass(frontierClass, target, settlementEvaluation, scoutScore);
      const candidate = { from, target, score, frontierClass };
      if (frontierClass === "economic") {
        frontierOpportunityEconomic += 1;
        if (isBetterSelection(candidate, bestEconomicExpand)) bestEconomicExpand = candidate;
      } else if (frontierClass === "scaffold") {
        frontierOpportunityScaffold += 1;
        if (isBetterSelection(candidate, bestScaffoldExpand)) bestScaffoldExpand = candidate;
      } else if (frontierClass === "scout") {
        frontierOpportunityScout += 1;
        if (isBetterSelection(candidate, bestScoutExpand)) bestScoutExpand = candidate;
      } else {
        frontierOpportunityWaste += 1;
      }
      if (isBetterSelection(candidate, bestExpand)) bestExpand = candidate;
    }
  }

  return {
    ...(bestAttack ? { attack: bestAttack } : {}),
    ...(bestExpand ? { expand: bestExpand } : {}),
    ...(bestEconomicExpand ? { economicExpand: bestEconomicExpand } : {}),
    ...(bestScaffoldExpand ? { scaffoldExpand: bestScaffoldExpand } : {}),
    ...(bestScoutExpand ? { scoutExpand: bestScoutExpand } : {}),
    frontierEnemyTargetCount: enemyTargets.size,
    frontierNeutralTargetCount: neutralTargets.size,
    frontierOpportunityEconomic,
    frontierOpportunityScout,
    frontierOpportunityScaffold,
    frontierOpportunityWaste
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
  const tilesByKey = new Map(tileList.map((tile) => [tileKeyOf(tile.x, tile.y), tile] as const));
  const ownedTiles = tileList.filter((tile) => tile.ownerId === playerId);
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
  if (analysis.attack) return createFrontierCommand(analysis.attack, playerId, clientSeq, issuedAt, sessionPrefix, "ATTACK");
  if (analysis.expand) return createFrontierCommand(analysis.expand, playerId, clientSeq, issuedAt, sessionPrefix, "EXPAND");
  return undefined;
};
