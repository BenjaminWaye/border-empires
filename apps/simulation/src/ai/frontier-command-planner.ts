import type { CommandEnvelope } from "@border-empires/sim-protocol";
import { isSeaTerrain, type Terrain, WORLD_HEIGHT, WORLD_WIDTH } from "@border-empires/shared";

import type { SettlementCandidateEvaluation } from "./ai-settlement-priority.js";
import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { dockCrossingCandidateTileKeys } from "../dock-network/dock-network.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";

type PlannerTile = {
  x: number;
  y: number;
  terrain: Terrain;
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
  needsFood?: boolean;
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>;
  onEvaluateNeutralTarget?: (targetKey: string) => void;
  /** When set, adds a directional bias toward this tile when scoring neutral expand candidates. */
  expansionObjective?: { x: number; y: number; kind: "neutral_value" | "enemy" };
  /** PR 1 measurement callback — emits per-phase durations from inside
   *  analyzeOwnedFrontierTargetsFromLookup so the hot loop can be
   *  located before any optimization. Phase names correspond to
   *  AI_PLANNER_PHASES entries. */
  onAnalyzeTiming?: (phase: string, durationMs: number) => void;
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
  enemyAttack?: FrontierSelection;
  barbarianAttack?: FrontierSelection;
  expand?: FrontierSelection;
  economicExpand?: FrontierSelection;
  directedExpand?: FrontierSelection;
  townSupportExpand?: FrontierSelection;
  scaffoldExpand?: FrontierSelection;
  scoutExpand?: FrontierSelection;
  frontierEnemyTargetCount: number;
  frontierEnemyPlayerTargetCount: number;
  frontierBarbarianTargetCount: number;
  frontierNeutralTargetCount: number;
  frontierOpportunityEconomic: number;
  frontierOpportunityTownSupport: number;
  frontierOpportunityScout: number;
  frontierOpportunityScaffold: number;
  frontierOpportunityWaste: number;
  /** True when the candidate cap (NARROW_ANALYZE_MAX_CANDIDATES) was hit. */
  narrowAnalyzeCapped: boolean;
};

const sortTiles = (left: { x: number; y: number }, right: { x: number; y: number }): number =>
  (left.x - right.x) || (left.y - right.y);

/** Bonus per Chebyshev step closer to the expansion objective. */
const DIRECTION_BIAS_WEIGHT = 40;

const wrapDistSingle = (a: number, b: number, size: number): number => {
  const d = Math.abs(a - b);
  return d < size - d ? d : size - d;
};

const chebyshevWrap = (ax: number, ay: number, bx: number, by: number): number =>
  Math.max(wrapDistSingle(ax, bx, WORLD_WIDTH), wrapDistSingle(ay, by, WORLD_HEIGHT));

const tileKeyOf = (x: number, y: number): string => `${x},${y}`;

const resourceScore = (resource: string | undefined, needsFood: boolean = false): number => {
  switch (resource) {
    case "FARM":
    case "FISH":
      return needsFood ? 360 : 180;
    case "IRON":
    case "WOOD":
    case "FUR":
      return 120;
    case "GEMS":
      return 90;
    default:
      return 0;
  }
};

/** Cap the number of candidates scored in a single analyze pass. See docs/plans/2026-05-30-cap-narrow-analyze-path.md. */
const NARROW_ANALYZE_MAX_CANDIDATES = 512;

const strategicFrontierTargetScore = (tile: PlannerTile, needsFood: boolean = false): number => {
  let score = 0;
  if (tile.town) score += 1_000;
  if (tile.dockId) score += 450;
  score += resourceScore(tile.resource, needsFood);
  if (!tile.resource && !tile.town && !tile.dockId) score -= 40;
  return score;
};

const ownedNeighborCount = (tilesByKey: PlannerTileLookup, tile: PlannerTile, playerId: string): number => {
  let count = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (tilesByKey.get(`${nx},${ny}`)?.ownerId === playerId) count += 1;
  });
  return count;
};

const coastlineDiscoveryValue = (tilesByKey: PlannerTileLookup, tile: PlannerTile): number => {
  let score = 0;
  forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
    if (isSeaTerrain(tilesByKey.get(`${nx},${ny}`)?.terrain as Terrain)) score += 18;
  });
  return score;
};

const candidateKeysForOrigin = (
  from: PlannerTile,
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>
): string[] => {
  const candidateKeys = new Set<string>();
  forEachFrontierNeighbor(from.x, from.y, (nx, ny) => candidateKeys.add(`${nx},${ny}`));
  if (from.dockId && dockLinksByDockTileKey) {
    for (const tileKey of dockCrossingCandidateTileKeys(tileKeyOf(from.x, from.y), dockLinksByDockTileKey)) {
      candidateKeys.add(tileKey);
    }
  }
  return [...candidateKeys];
};

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
  scoutScore: number,
  needsFood: boolean = false
): number => {
  const strategicScore = strategicFrontierTargetScore(target, needsFood);
  if (frontierClass === "economic") {
    if (needsFood && target.town && !target.resource) {
      return 100 + scoutScore;
    }
    return 260 + strategicScore + settlementEvaluation.score * 0.25;
  }
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
  const needsFood = affordability.needsFood ?? false;
  const dockLinksByDockTileKey = affordability.dockLinksByDockTileKey;
  const expansionObjective = affordability.expansionObjective;
  const emitTiming = affordability.onAnalyzeTiming;
  const iterStartedAt = performance.now();
  const originCandidateKeyCache = new Map<string, string[]>();
  const cachedCandidateKeysForOrigin = (from: PlannerTile): string[] => {
    const k = tileKeyOf(from.x, from.y);
    let cached = originCandidateKeyCache.get(k);
    if (!cached) {
      cached = candidateKeysForOrigin(from, dockLinksByDockTileKey);
      originCandidateKeyCache.set(k, cached);
    }
    return cached;
  };
  let neighborLookupsTotalMs = 0;
  let scoreCalcTotalMs = 0;
  const scoreByTargetKey = new Map<string, number>();
  const enemyTargets = new Set<string>();
  const enemyPlayerTargets = new Set<string>();
  const barbarianTargets = new Set<string>();
  const neutralTargets = new Set<string>();
  const domainTilesByKey = tilesByKey as ReadonlyMap<string, import("@border-empires/game-domain").DomainTileState>;
  // When the origin set is large (all owned tiles as fallback), pre-filter to
  // empire-perimeter tiles — those adjacent to at least one non-owned LAND tile.
  // This bounds the two-pass scan to O(N_border) instead of O(N_owned), cutting
  // analysis time from ~53ms to <10ms for a 1400-tile fully-settled empire.
  // The threshold avoids overhead for the normal case (small frontier-tile sets).
  const BORDER_PREFILTER_THRESHOLD = 150;
  const ownedTileListRaw = [...ownedTiles];
  let prefilteredOrigins = ownedTileListRaw;
  if (ownedTileListRaw.length > BORDER_PREFILTER_THRESHOLD) {
    const border = ownedTileListRaw.filter(tile => {
      let found = false;
      forEachFrontierNeighbor(tile.x, tile.y, (nx, ny) => {
        if (!found) {
          const n = tilesByKey.get(`${nx},${ny}`);
          if (n && n.terrain === "LAND" && n.ownerId !== playerId) found = true;
        }
      });
      return found;
    });
    if (border.length > 0) prefilteredOrigins = border;
  }
  const ownedTileList = prefilteredOrigins.sort(sortTiles);
  const currentReachableLandKeys = new Set<string>();
  const neutralEvaluationByTargetKey = new Map<string, SettlementCandidateEvaluation>();
  let bestAttack: FrontierSelection | undefined;
  let bestEnemyAttack: FrontierSelection | undefined;
  let bestBarbarianAttack: FrontierSelection | undefined;
  let bestExpand: FrontierSelection | undefined;
  let bestEconomicExpand: FrontierSelection | undefined;
  let bestDirectedExpand: FrontierSelection | undefined;
  let bestTownSupportExpand: FrontierSelection | undefined;
  let bestScaffoldExpand: FrontierSelection | undefined;
  let bestScoutExpand: FrontierSelection | undefined;
  let frontierOpportunityEconomic = 0;
  let frontierOpportunityTownSupport = 0;
  let frontierOpportunityScout = 0;
  let frontierOpportunityScaffold = 0;
  let frontierOpportunityWaste = 0;

  for (const from of ownedTileList) {
    for (const candidateKey of cachedCandidateKeysForOrigin(from)) {
      const target = tilesByKey.get(candidateKey);
      if (!target || target.terrain !== "LAND" || target.ownerId === playerId) continue;
      currentReachableLandKeys.add(candidateKey);
    }
  }

  let capped = false;
  let candidatesEvaluated = 0;
  for (const from of ownedTileList) {
    for (const targetKey of cachedCandidateKeysForOrigin(from)) {
      const candidateStartedAt = performance.now();
      const target = tilesByKey.get(targetKey);
      if (!target || target.terrain !== "LAND" || target.ownerId === playerId) continue;
      if (target.ownerId) {
        enemyTargets.add(targetKey);
        if (target.ownerId === "barbarian-1" || target.ownershipState === "BARBARIAN") {
          barbarianTargets.add(targetKey);
        } else {
          enemyPlayerTargets.add(targetKey);
        }
        if (!canAttack) continue;
        const cachedScore = scoreByTargetKey.get(targetKey);
        const score =
          cachedScore ??
          (() => {
            const scoreStartedAt = performance.now();
            const neighborStartedAt = performance.now();
            const neighborOwned = ownedNeighborCount(tilesByKey, target, playerId);
            const neighborCoastline = coastlineDiscoveryValue(tilesByKey, target);
            const neighborMs = performance.now() - neighborStartedAt;
            neighborLookupsTotalMs += neighborMs;
            emitTiming?.("analyze_neighbor_lookups", neighborMs);
            const result =
              strategicFrontierTargetScore(target, needsFood) +
              (target.ownershipState === "FRONTIER" ? 120 : 0) +
              neighborOwned * 95 +
              neighborCoastline * 0.35;
            const scoreMs = performance.now() - scoreStartedAt;
            scoreCalcTotalMs += scoreMs;
            emitTiming?.("analyze_score_calc", scoreMs);
            return result;
          })();
        scoreByTargetKey.set(targetKey, score);
        const candidate = { from, target, score };
        if (isBetterSelection(candidate, bestAttack)) bestAttack = candidate;
        if (target.ownerId === "barbarian-1" || target.ownershipState === "BARBARIAN") {
          if (isBetterSelection(candidate, bestBarbarianAttack)) bestBarbarianAttack = candidate;
        } else if (isBetterSelection(candidate, bestEnemyAttack)) {
          bestEnemyAttack = candidate;
        }
        emitTiming?.("analyze_per_candidate", performance.now() - candidateStartedAt);
        candidatesEvaluated += 1;
        if (candidatesEvaluated >= NARROW_ANALYZE_MAX_CANDIDATES) {
          capped = true;
          break;
        }
        continue;
      }

      neutralTargets.add(targetKey);
      if (!canExpand) continue;
      const cachedSettlementEvaluation = neutralEvaluationByTargetKey.get(targetKey);
      const settlementEvaluation =
        cachedSettlementEvaluation ??
        (() => {
          affordability.onEvaluateNeutralTarget?.(targetKey);
          const nextEvaluation = evaluateSettlementCandidate(
            playerId,
            target as import("@border-empires/game-domain").DomainTileState,
            domainTilesByKey,
            new Set([targetKey])
          );
          neutralEvaluationByTargetKey.set(targetKey, nextEvaluation);
          return nextEvaluation;
        })();
      const scoutScore = (() => {
        const neighborStartedAt = performance.now();
        const result = scoutExpandScore(tilesByKey, from, target, playerId, currentReachableLandKeys, dockLinksByDockTileKey);
        const neighborMs = performance.now() - neighborStartedAt;
        neighborLookupsTotalMs += neighborMs;
        emitTiming?.("analyze_neighbor_lookups", neighborMs);
        return result;
      })();
      const frontierClass = classifyNeutralOpportunity(target, settlementEvaluation, scoutScore);
      const scoreStartedAt = performance.now();
      const score = selectionScoreForClass(frontierClass, target, settlementEvaluation, scoutScore, needsFood);
      const scoreMs = performance.now() - scoreStartedAt;
      scoreCalcTotalMs += scoreMs;
      emitTiming?.("analyze_score_calc", scoreMs);
      const candidate = { from, target, score, frontierClass };
      if (settlementEvaluation.townSupportNeed > 0) {
        frontierOpportunityTownSupport += 1;
        const townSupportCandidate = {
          ...candidate,
          score: score + settlementEvaluation.townSupportNeed * 120
        };
        if (isBetterSelection(townSupportCandidate, bestTownSupportExpand)) bestTownSupportExpand = townSupportCandidate;
      }
      // Directional bias: bonus for stepping toward the expansion objective.
      if (expansionObjective) {
        const fromDist = chebyshevWrap(from.x, from.y, expansionObjective.x, expansionObjective.y);
        const targetDist = chebyshevWrap(target.x, target.y, expansionObjective.x, expansionObjective.y);
        const directionBonus = (fromDist - targetDist) * DIRECTION_BIAS_WEIGHT;
        if (directionBonus > 0 && frontierClass !== "economic") {
          // Non-economic tile that steps toward the objective — candidates for directedExpand.
          const directedScore = directionBonus + score * 0.1;
          const directedCandidate = { from, target, score: directedScore, frontierClass };
          if (isBetterSelection(directedCandidate, bestDirectedExpand)) bestDirectedExpand = directedCandidate;
        }
      }
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
      emitTiming?.("analyze_per_candidate", performance.now() - candidateStartedAt);
      candidatesEvaluated += 1;
      if (candidatesEvaluated >= NARROW_ANALYZE_MAX_CANDIDATES) {
        capped = true;
        break;
      }
    }
    if (capped) break;
  }

  emitTiming?.("analyze_score_calc", scoreCalcTotalMs);
  emitTiming?.("analyze_iter_total", performance.now() - iterStartedAt);
  return {
    ...(bestAttack ? { attack: bestAttack } : {}),
    ...(bestEnemyAttack ? { enemyAttack: bestEnemyAttack } : {}),
    ...(bestBarbarianAttack ? { barbarianAttack: bestBarbarianAttack } : {}),
    ...(bestExpand ? { expand: bestExpand } : {}),
    ...(bestEconomicExpand ? { economicExpand: bestEconomicExpand } : {}),
    ...(bestDirectedExpand ? { directedExpand: bestDirectedExpand } : {}),
    ...(bestTownSupportExpand ? { townSupportExpand: bestTownSupportExpand } : {}),
    ...(bestScaffoldExpand ? { scaffoldExpand: bestScaffoldExpand } : {}),
    ...(bestScoutExpand ? { scoutExpand: bestScoutExpand } : {}),
    frontierEnemyTargetCount: enemyTargets.size,
    frontierEnemyPlayerTargetCount: enemyPlayerTargets.size,
    frontierBarbarianTargetCount: barbarianTargets.size,
    frontierNeutralTargetCount: neutralTargets.size,
    frontierOpportunityEconomic,
    frontierOpportunityTownSupport,
    frontierOpportunityScout,
    frontierOpportunityScaffold,
    frontierOpportunityWaste,
    narrowAnalyzeCapped: capped
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
