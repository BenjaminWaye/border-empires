import type { CommandEnvelope } from "@border-empires/sim-protocol";

import type { SettlementCandidateEvaluation } from "./ai-settlement-priority.js";
import { evaluateSettlementCandidate } from "./ai-settlement-priority.js";
import { forEachFrontierNeighbor } from "../frontier-topology.js";
import { isFrontierAdjacent } from "../frontier-adjacency/frontier-adjacency.js";
import {
  candidateKeysForOrigin,
  chebyshevWrap,
  classifyNeutralOpportunity,
  coastlineDiscoveryValue,
  createFrontierCommand,
  DIRECTION_BIAS_WEIGHT,
  type FrontierClass,
  type FrontierSelection,
  isBetterSelection,
  NARROW_ANALYZE_MAX_CANDIDATES,
  ownedNeighborCount,
  type PlannerTile,
  type PlannerTileLookup,
  scoutExpandScore,
  selectionScoreForClass,
  sortTiles,
  strategicFrontierTargetScore,
  tileKeyOf
} from "./frontier-scoring.js";

export type { FrontierClass } from "./frontier-scoring.js";

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
  /**
   * Opt-in only — set true from the real empire AI planner
   * (automation-command-planner.ts). Deliberately left false/undefined for
   * barbarians and other system-job callers (system-job-barbarian-planner.ts,
   * system-job-worker.ts) so their expansion behavior is unchanged:
   *  - biases tied scout candidates toward diagonal steps (more fog revealed
   *    per claim under the game's Chebyshev-square vision shape)
   *  - refuses to select a "waste" candidate (no resource/dock/town and no
   *    new frontier/fog to reveal) as the EXPAND target at all, rather than
   *    spending gold on a tile with zero strategic or scouting value.
   */
  preferFogEfficientExpansion?: boolean;
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
  /**
   * Diagnostic-only (see docs/agents/topic-runbooks.md ai debugging notes):
   * how many neighbor candidate tiles this scan visited vs how many were
   * entirely absent from the planner's tilesByKey (worker never received a
   * tile_delta for them, vs. genuinely known-and-classified-as-waste).
   * A high missing/total ratio for a large empire points at a sync-scope gap
   * (planner-sync-scope.ts's relevance radius or an incremental-rebuild bug),
   * not a legitimately empty frontier.
   */
  neighborCandidateTotal: number;
  missingNeighborTileCount: number;
};

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
  const preferFogEfficientExpansion = affordability.preferFogEfficientExpansion ?? false;
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
  let neighborCandidateTotal = 0;
  let missingNeighborTileCount = 0;
  for (const from of ownedTileList) {
    for (const targetKey of cachedCandidateKeysForOrigin(from)) {
      const candidateStartedAt = performance.now();
      const target = tilesByKey.get(targetKey);
      neighborCandidateTotal += 1;
      if (!target) missingNeighborTileCount += 1;
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

      // A dock crossing only lands you on the linked dock tile itself when
      // settling — you must capture that dock before claiming land beyond
      // it. dockCrossingCandidateTileKeys() also includes the linked dock's
      // frontier neighbors (needed so ATTACK can reach enemy land past an
      // owned-but-hostile dock), so exclude those from EXPAND candidates
      // unless they're also plain frontier-adjacent to `from`.
      if (
        !isFrontierAdjacent(from.x, from.y, target.x, target.y) &&
        !(from.dockId && dockLinksByDockTileKey?.get(tileKeyOf(from.x, from.y))?.includes(targetKey))
      ) {
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
        const result = scoutExpandScore(
          tilesByKey,
          from,
          target,
          playerId,
          currentReachableLandKeys,
          dockLinksByDockTileKey,
          preferFogEfficientExpansion
        );
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
      // Opt-in (real AI empire planner only, see preferFogEfficientExpansion doc):
      // a "waste" tile with no resource/dock/town AND no new frontier/fog to
      // reveal (scoutScore <= 0) has zero expansion value — never let it win
      // the EXPAND slot. Barbarians/system-job callers keep the historical
      // behavior of always picking something.
      const isValuelessWaste = preferFogEfficientExpansion && frontierClass === "waste" && scoutScore <= 0;
      if (!isValuelessWaste && isBetterSelection(candidate, bestExpand)) bestExpand = candidate;
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
    narrowAnalyzeCapped: capped,
    neighborCandidateTotal,
    missingNeighborTileCount
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
