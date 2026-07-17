import type { DomainStrategicResourceKey, DomainTileState } from "@border-empires/game-domain";
import {
  ATTACK_MANPOWER_MIN,
  DEVELOPMENT_PROCESS_LIMIT,
  FRONTIER_CLAIM_COST
} from "@border-empires/shared";

import { analyzeOwnedFrontierTargetsFromLookup, type FrontierAnalysis } from "./frontier-command-planner.js";
import { explainFrontierOriginTile } from "./planner-candidate-index.js";
import { BROAD_FALLBACK_FRONTIER_SAMPLE_CAP, strideSample } from "./broad-fallback-sample.js";
import { computeTownSupport } from "../town-support.js";
import {
  chooseBestEconomicBuild,
  chooseBestFortBuild,
  chooseBestSiegeOutpostBuild
} from "./structure-command-planner.js";
import { economyWeak, foodCoverageLow } from "./ai-economic-heuristics.js";
import { buildAutomationStrategicSnapshot, type AutomationStrategicSnapshot, type AutomationVictoryPath } from "./automation-strategic-snapshot.js";
import type { PlannerOwnedStructureCounts } from "./planner-owned-structure-counts.js";
import type { AutomationPlannerDecisionContext } from "./automation-command-planner-helpers.js";
import { runUtilityPolicy } from "./utility/utility-dispatch.js";
import type { DecisionCooldownMap } from "./ai-rejection-cooldown.js";

import {
  createAutomationNoopDiagnostic,
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES
} from "./automation-command-planner-types.js";
import type {
  AutomationNoopReason,
  AutomationPlannerDiagnostic,
  AutomationPlannerPhase,
  AutomationPlannerResult,
  AutomationPlannerTile,
  AutomationPreplanProgressState,
  AutomationSessionPrefix
} from "./automation-command-planner-types.js";

export {
  AUTOMATION_NOOP_REASONS,
  AUTOMATION_PREPLAN_REASONS,
  AUTOMATION_PREPLAN_PROGRESS_STATES,
  createAutomationNoopDiagnostic
};
export type {
  AutomationNoopReason,
  AutomationPlannerDiagnostic,
  AutomationPlannerPhase,
  AutomationPlannerResult,
  AutomationPlannerTile,
  AutomationPreplanProgressState,
  AutomationSessionPrefix
};
export type { AutomationPreplanReason } from "./automation-command-planner-types.js";

type AutomationPlannerInput<TTile extends AutomationPlannerTile> = {
  playerId: string;
  points: number;
  manpower: number;
  techIds?: readonly string[];
  domainIds?: readonly string[];
  strategicResources?: Partial<Record<DomainStrategicResourceKey, number>>;
  settledTileCount?: number;
  townCount?: number;
  incomePerMinute?: number;
  hasActiveLock: boolean;
  activeDevelopmentProcessCount: number;
  reservedDevelopmentSlots?: number;
  frontierTiles: readonly TTile[];
  hotFrontierTiles?: readonly TTile[];
  strategicFrontierTiles?: readonly TTile[];
  buildCandidateTiles?: readonly TTile[];
  ownedTiles: readonly TTile[];
  ownedStructureCounts?: PlannerOwnedStructureCounts;
  tilesByKey: ReadonlyMap<string, TTile>;
  dockLinksByDockTileKey?: ReadonlyMap<string, readonly string[]>;
  clientSeq: number;
  issuedAt: number;
  sessionPrefix: AutomationSessionPrefix;
  playerScopeKeyCount?: number | undefined;
  playerScopeTileCount?: number | undefined;
  onPhaseTiming?: (sample: {
    phase: AutomationPlannerPhase;
    durationMs: number;
  }) => void;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
  onStrategicSnapshot?: (snapshot: AutomationStrategicSnapshot) => void;
  preplanProgressState?: AutomationPreplanProgressState | undefined;
  // Tile keys this player has been pounding without breakthrough — the
  // attack gates below skip targets in this set so the planner falls through
  // to SETTLE/EXPAND/BUILD. See ai-attack-stalemate.ts for the policy.
  attackStalemateTargetTileKeys?: ReadonlySet<string>;
  /** Nearest high-value neutral or enemy tile (from main-thread beacon index). */
  expansionObjective?: { x: number; y: number; kind: "neutral_value" | "enemy" };
  /** Number of muster flags this player currently has active. */
  activeMusterCount?: number;
  /** Tile keys of this player's currently active muster flags. */ musterTileKeys?: ReadonlySet<string>;
  /** Per-decision-class rejection cooldowns — true means the class is on cooldown. */
  decisionCooldowns?: DecisionCooldownMap;
  // Bounded BFS front of owned tile keys for this AI's current spatial focus.
  // When provided, frontier candidate enumeration is restricted to origins
  // inside this set, capping per-tick CPU regardless of empire size. See
  // ai-spatial-focus.ts for selection. Optional so test inputs and the no-AI
  // system planner keep working unchanged.
  spatialFocusFront?: ReadonlySet<string>;
};

const emptyFrontierAnalysis = (): FrontierAnalysis => ({
  frontierEnemyTargetCount: 0,
  frontierEnemyPlayerTargetCount: 0,
  frontierBarbarianTargetCount: 0,
  frontierNeutralTargetCount: 0,
  frontierOpportunityEconomic: 0,
  frontierOpportunityTownSupport: 0,
  frontierOpportunityScout: 0,
  frontierOpportunityScaffold: 0,
  frontierOpportunityWaste: 0,
  narrowAnalyzeCapped: false,
  neighborCandidateTotal: 0,
  missingNeighborTileCount: 0
});

const hasActionableFrontierAnalysis = (analysis: FrontierAnalysis): boolean =>
  analysis.frontierEnemyTargetCount > 0 ||
  analysis.frontierNeutralTargetCount > analysis.frontierOpportunityWaste ||
  Boolean(
    analysis.attack ||
      analysis.expand ||
      analysis.economicExpand ||
      analysis.directedExpand ||
      analysis.townSupportExpand || analysis.scaffoldExpand || analysis.scoutExpand
  );

const dedupeTiles = <TTile extends AutomationPlannerTile>(
  tiles: Iterable<TTile>
): TTile[] => {
  const seen = new Set<string>();
  const deduped: TTile[] = [];
  for (const tile of tiles) {
    const key = `${tile.x},${tile.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(tile);
  }
  return deduped;
};

export const planAutomationCommand = <TTile extends AutomationPlannerTile>(
  input: AutomationPlannerInput<TTile>
): AutomationPlannerResult => {
  const recordPhaseTiming = (phase: AutomationPlannerPhase, startedAt: number): void => {
    input.onPhaseTiming?.({
      phase,
      durationMs: Math.max(0, Date.now() - startedAt)
    });
  };
  if (input.hasActiveLock) {
    return {
      diagnostic: createAutomationNoopDiagnostic(input.playerId, input.sessionPrefix, "active_lock")
    };
  }

  // Restrict per-AI candidate sets to the spatial focus front when present.
  // Without this, large empires made per-tick selectors (structure build)
  // iterate the full owned/frontier set every tick. Fall back to the
  // unfiltered list when the focus excludes everything, so the AI never
  // starves on a bad focus.
  const focusFront = input.spatialFocusFront;
  // Tracks whether restrictToFocus had to widen to the unfiltered list this
  // call (defined focus front, zero overlap with the candidate set). Feeding
  // a fallback-found result into scanFoundActionableCandidate would defeat
  // ai-spatial-focus.ts's unproductive-streak rotation (production incident:
  // AI-4/ai-1 pinned on the same dead front for 10+ minutes). See tests below.
  let frontierScanUsedFocusFallback = false;
  let buildScanUsedFocusFallback = false;
  const restrictToFocus = <T extends AutomationPlannerTile>(
    tiles: readonly T[],
    onFallback?: () => void
  ): readonly T[] => {
    if (!focusFront || tiles.length === 0) return tiles;
    const filtered = tiles.filter((tile) => focusFront.has(`${tile.x},${tile.y}`));
    if (filtered.length > 0) return filtered as readonly T[];
    onFallback?.();
    return tiles;
  };
  // Last-resort fallback for when frontierTiles/hotFrontierTiles are ALL
  // empty. At steady state for any real empire this is never reached, so it
  // must be lazy — this used to scan
  // every owned tile unconditionally on every single plan regardless of
  // empire size (a 20k-tile empire re-scanned 20k tiles for a value
  // discarded on nearly every call).
  let ownedFrontierTilesCache: readonly TTile[] | undefined;
  const ownedFrontierTiles = (): readonly TTile[] => {
    if (!ownedFrontierTilesCache) {
      ownedFrontierTilesCache = restrictToFocus(input.ownedTiles).filter(
        (tile) => tile.terrain === "LAND" && tile.ownerId === input.playerId && tile.ownershipState === "FRONTIER"
      ) as readonly TTile[];
    }
    return ownedFrontierTilesCache;
  };
  // Bounded sibling of ownedFrontierTiles() above, for the broad fallback's
  // origin union specifically. That union needs a backstop for callers whose
  // input.frontierTiles is real but incomplete (see the regression test for
  // this), but — unlike ownedFrontierTiles()'s other caller, which needs an
  // ACCURATE count — the broad fallback only needs a bounded SAMPLE of owned
  // FRONTIER tiles, same reasoning as BROAD_FALLBACK_FRONTIER_SAMPLE_CAP.
  // Sampling input.ownedTiles (not just the already-sampled frontierTiles)
  // keeps this cheap regardless of empire size instead of the O(owned) scan
  // ownedFrontierTiles() does when no spatial focus is set.
  let ownedFrontierTilesSampleCache: readonly TTile[] | undefined;
  const ownedFrontierTilesSample = (): readonly TTile[] => {
    if (!ownedFrontierTilesSampleCache) {
      ownedFrontierTilesSampleCache = restrictToFocus(strideSample(input.ownedTiles, BROAD_FALLBACK_FRONTIER_SAMPLE_CAP)).filter(
        (tile) => tile.terrain === "LAND" && tile.ownerId === input.playerId && tile.ownershipState === "FRONTIER"
      ) as readonly TTile[];
    }
    return ownedFrontierTilesSampleCache;
  };
  const canAttack = input.points >= FRONTIER_CLAIM_COST && input.manpower >= ATTACK_MANPOWER_MIN;
  const canExpand = input.points >= FRONTIER_CLAIM_COST;
  // strategicFrontierTiles (isStrategicFrontierTile: good SETTLE candidates —
  // e.g. interior gaps that improve territory shape) used to sit ahead of
  // frontierTiles here, but there is no SETTLE decision class in the AI's
  // utility policy — the AI never acts on "good to settle" directly. Worse,
  // when hotFrontierTiles is empty this tier fired first and starved the
  // EXPAND/ATTACK scan: analyzeOwnedFrontierTargetsFromLookup only looks for
  // targets among an origin's immediate neighbors, and "good to settle"
  // (defensive shape/economic value of the tile itself) says nothing about
  // whether an origin has an unclaimed/hostile neighbor to expand into.
  // Production case: ai-1 had 266 strategicFrontierTiles (mostly interior
  // gaps with no expand-worthy neighbors) and 0 hotFrontierTiles, so the scan
  // was pinned on the strategic set every tick — permanently starving
  // whatever genuinely expandable tile existed elsewhere in its 421-tile
  // frontier — while never being able to act on the strategic tiles anyway.
  const baseFrontierOrigins =
    (input.hotFrontierTiles?.length
      ? input.hotFrontierTiles
      : input.frontierTiles.length > 0
        ? input.frontierTiles
        : input.ownedTiles) as readonly TTile[];
  const baseFrontierOriginKeys = new Set(baseFrontierOrigins.map((tile) => `${tile.x},${tile.y}`));
  // Source dock/town-support origins from the incrementally-maintained
  // buildCandidateTiles set instead of scanning every owned tile.
  // isBuildCandidateTile (planner-candidate-index.ts) already includes any
  // tile with its own dockId/town, so buildCandidateTiles is a safe
  // superset here — bounded by resource/dock/town/hostile-border tile
  // count, not total empire size. Only fall back to a full owned-tile scan
  // when the incremental set isn't supplied (e.g. direct unit-test calls).
  const dockTownScanSource = input.buildCandidateTiles?.length ? input.buildCandidateTiles : input.ownedTiles;
  const dockOrigins = dockTownScanSource.filter(
    (tile) => Boolean(tile.dockId) && !baseFrontierOriginKeys.has(`${tile.x},${tile.y}`)
  );
  const townSupportOrigins = dockTownScanSource.filter((tile) => {
    if (tile.ownerId !== input.playerId || tile.ownershipState !== "SETTLED" || !tile.town) return false;
    if (tile.town.populationTier === "SETTLEMENT") return false;
    const storedMax = tile.town.supportMax;
    const storedCurrent = tile.town.supportCurrent;
    if (typeof storedMax === "number" && typeof storedCurrent === "number") {
      return storedMax > storedCurrent;
    }
    const { supportMax, supportCurrent } = computeTownSupport(input.playerId, tile.x, tile.y, input.tilesByKey);
    return supportMax > supportCurrent;
  });
  const unfilteredNarrowOrigins =
    dockOrigins.length > 0 || townSupportOrigins.length > 0
      ? dedupeTiles([...baseFrontierOrigins, ...townSupportOrigins, ...dockOrigins])
      : baseFrontierOrigins;
  const narrowFrontierOrigins = restrictToFocus(unfilteredNarrowOrigins, () => {
    frontierScanUsedFocusFallback = true;
  });
  // settledTileCount/townCount are already incrementally maintained per
  // player (player-runtime-summary.ts) and supplied on every real call
  // path. controlledTileCount is just settled + frontier tile counts
  // (mutually exclusive ownershipState values) — no scan needed. Only fall
  // back to a full owned-tile sweep when a caller doesn't supply both
  // counts (e.g. direct unit-test calls); this used to run unconditionally
  // on every plan regardless of empire size.
  let settledTileCount = input.settledTileCount;
  let townCount = input.townCount;
  let controlledTileCount: number;
  if (settledTileCount !== undefined && townCount !== undefined) {
    controlledTileCount =
      settledTileCount + (input.frontierTiles.length > 0 ? input.frontierTiles.length : ownedFrontierTiles().length);
  } else {
    let computedSettledTileCount = 0;
    let computedTownCount = 0;
    let computedControlledTileCount = 0;
    for (const tile of input.ownedTiles) {
      const isSettled = tile.ownershipState === "SETTLED";
      const isFrontier = tile.ownershipState === "FRONTIER";
      if (isSettled || isFrontier) computedControlledTileCount += 1;
      if (settledTileCount === undefined && isSettled) computedSettledTileCount += 1;
      if (townCount === undefined && isSettled && tile.town) computedTownCount += 1;
    }
    settledTileCount = settledTileCount ?? computedSettledTileCount;
    townCount = townCount ?? computedTownCount;
    controlledTileCount = computedControlledTileCount;
  }
  const incomePerMinute = input.incomePerMinute ?? 0;
  const needsFood = foodCoverageLow(input.strategicResources, townCount);
  const needsEconomy = economyWeak(incomePerMinute, settledTileCount);
  const frontierStartedAt = Date.now();
  let frontierOrigins = narrowFrontierOrigins;
  let frontierAnalysis =
    canAttack || canExpand
      ? analyzeOwnedFrontierTargetsFromLookup(input.tilesByKey, frontierOrigins, input.playerId, {
          canAttack,
          canExpand,
          needsFood,
          preferFogEfficientExpansion: true,
          ...(input.dockLinksByDockTileKey ? { dockLinksByDockTileKey: input.dockLinksByDockTileKey } : {}),
          ...(input.expansionObjective ? { expansionObjective: input.expansionObjective } : {}),
          onAnalyzeTiming: (phase, durationMs) => {
            input.onPhaseTiming?.({ phase: phase as AutomationPlannerPhase, durationMs });
          }
        })
      : emptyFrontierAnalysis();
  let frontierAnalysisActionable = hasActionableFrontierAnalysis(frontierAnalysis);
  // Diagnostic-only now (see BROAD_FALLBACK_FRONTIER_SAMPLE_CAP above): the
  // broad fallback used to be skipped outright above this owned-tile count;
  // it now always runs, bounded by sampling input.frontierTiles instead.
  // Kept as a field (always false) so existing diagnostic consumers/tests
  // don't need to special-case its absence.
  let broadFallbackSkipped = false;
  if ((canAttack || canExpand) && !frontierAnalysisActionable && input.frontierTiles.length > 0) {
    {
      // Uses ownedFrontierTilesSample() (bounded), not ownedFrontierTiles()
      // (unbounded O(owned) scan) — see that function's doc comment.
      const broadFrontierOriginsAll = dedupeTiles([
        ...narrowFrontierOrigins,
        ...strideSample(input.frontierTiles, BROAD_FALLBACK_FRONTIER_SAMPLE_CAP),
        ...ownedFrontierTilesSample()
      ]);
      // The broad fallback also respects the spatial focus front so a large
      // empire cannot blow up planner CPU through the fallback path.
      const broadFrontierOrigins = restrictToFocus(broadFrontierOriginsAll, () => {
        frontierScanUsedFocusFallback = true;
      });
      if (broadFrontierOrigins.length > frontierOrigins.length) {
        const broadFrontierAnalysis = analyzeOwnedFrontierTargetsFromLookup(input.tilesByKey, broadFrontierOrigins, input.playerId, {
          canAttack,
          canExpand,
          needsFood,
          preferFogEfficientExpansion: true,
          ...(input.dockLinksByDockTileKey ? { dockLinksByDockTileKey: input.dockLinksByDockTileKey } : {}),
          ...(input.expansionObjective ? { expansionObjective: input.expansionObjective } : {}),
          onAnalyzeTiming: (phase, durationMs) => {
            input.onPhaseTiming?.({ phase: phase as AutomationPlannerPhase, durationMs });
          }
        });
        if (hasActionableFrontierAnalysis(broadFrontierAnalysis)) {
          frontierOrigins = broadFrontierOrigins;
          frontierAnalysis = broadFrontierAnalysis;
          frontierAnalysisActionable = true;
        }
      }
    }
  }
  recordPhaseTiming("choose_frontier", frontierStartedAt);

  const effectiveDevelopmentProcessCount = Math.min(DEVELOPMENT_PROCESS_LIMIT, input.activeDevelopmentProcessCount + Math.max(0, input.reservedDevelopmentSlots ?? 0));
  let economicBuild: ReturnType<typeof chooseBestEconomicBuild> | undefined;
  let fortBuild: ReturnType<typeof chooseBestFortBuild> | undefined;
  let siegeOutpostBuild: ReturnType<typeof chooseBestSiegeOutpostBuild> | undefined;
  if (input.sessionPrefix === "ai-runtime" && effectiveDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT) {
    const structurePlayer = {
      id: input.playerId,
      points: input.points,
      ...(input.techIds ? { techIds: input.techIds } : {}),
      ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
      ...(input.ownedStructureCounts ? { ownedStructureCounts: input.ownedStructureCounts } : {}),
      settledTileCount,
      townCount,
      incomePerMinute
    };
    const structureCandidates = input.buildCandidateTiles?.length ? input.buildCandidateTiles : input.ownedTiles;
    const buildCandidates = restrictToFocus(structureCandidates, () => {
      buildScanUsedFocusFallback = true;
    });
    // Competition is resolved by scoring, not a boolean gate — always compute
    // so BUILD_ECONOMY can be scored even when frontier action is available.
    economicBuild = chooseBestEconomicBuild(structurePlayer, input.ownedTiles, input.tilesByKey, buildCandidates);
    fortBuild = chooseBestFortBuild(structurePlayer, input.ownedTiles, input.tilesByKey, buildCandidates);
    siegeOutpostBuild = chooseBestSiegeOutpostBuild(structurePlayer, input.ownedTiles, input.tilesByKey, buildCandidates);
  }

  // Debug-only bridge from the generic TTile scan to explainFrontierOriginTile's
  // concrete DomainTileState signature (same cast pattern as
  // frontier-command-planner.ts's domainTilesByKey) — TTile's structural
  // shape (AutomationPlannerTile) already matches at runtime, but the
  // generic type parameter isn't verifiable against DomainTileState at
  // compile time without this assertion.
  const domainTilesByKey = input.tilesByKey as unknown as ReadonlyMap<string, DomainTileState>;
  const diagnosticBase: AutomationPlannerDiagnostic = {
    playerId: input.playerId,
    sessionPrefix: input.sessionPrefix,
    frontierEnemyTargetCount: frontierAnalysis.frontierEnemyTargetCount,
    frontierEnemyPlayerTargetCount: frontierAnalysis.frontierEnemyPlayerTargetCount,
    frontierBarbarianTargetCount: frontierAnalysis.frontierBarbarianTargetCount,
    frontierNeutralTargetCount: frontierAnalysis.frontierNeutralTargetCount,
    frontierOpportunityEconomic: frontierAnalysis.frontierOpportunityEconomic,
    frontierOpportunityTownSupport: frontierAnalysis.frontierOpportunityTownSupport,
    frontierOpportunityScout: frontierAnalysis.frontierOpportunityScout,
    frontierOpportunityScaffold: frontierAnalysis.frontierOpportunityScaffold,
    frontierOpportunityWaste: frontierAnalysis.frontierOpportunityWaste,
    neighborCandidateTotal: frontierAnalysis.neighborCandidateTotal,
    missingNeighborTileCount: frontierAnalysis.missingNeighborTileCount,
    canAttack,
    canExpand,
    ownedTileCount: input.ownedTiles.length,
    // Diagnostic-only: report the cached count without forcing computation
    // (0 means the lazy fallback was never needed this tick, which is the
    // common/healthy case for any empire with populated frontier sets).
    ownedFrontierTileCount: ownedFrontierTilesCache?.length ?? 0,
    broadFallbackSkipped: broadFallbackSkipped || undefined,
    narrowAnalyzeCapped: frontierAnalysis.narrowAnalyzeCapped || undefined,
    frontierTileCountInput: input.frontierTiles.length,
    hotFrontierTileCountInput: input.hotFrontierTiles?.length ?? 0,
    strategicFrontierTileCountInput: input.strategicFrontierTiles?.length ?? 0,
    frontierOriginCount: frontierOrigins.length,
    dockOriginCount: dockOrigins.length,
    frontierOriginKeysSample: frontierOrigins.slice(0, 8).map((tile) => `${tile.x},${tile.y}`),
    // Debug-only: explains *why* each sampled origin was classified hot —
    // recomputed live from tilesByKey, so a mismatch against the cached
    // hotFrontierTileKeys entry that produced this origin set (reason:
    // "not_owned_frontier" or "none") is a stale-index signal, not a
    // legitimately hot tile. See planner-candidate-index.ts's
    // explainFrontierOriginTile, which mirrors isHotFrontierTile exactly.
    frontierOriginExplanations: frontierOrigins
      .slice(0, 8)
      .map((tile) => explainFrontierOriginTile(input.playerId, tile as unknown as DomainTileState, domainTilesByKey)),
    // Feeds ai-spatial-focus.ts's unproductive-streak rotation (via
    // runtime.ts): whether *any* category (frontier/settle/build) found
    // something actionable this tick, restricted to the same spatial-focus
    // front. Results found only via restrictToFocus's unfiltered-fallback
    // widening (frontierScanUsedFocusFallback / buildScanUsedFocusFallback)
    // do NOT count — see the fallback tracking above and its regression test.
    scanFoundActionableCandidate:
      (frontierAnalysisActionable && !frontierScanUsedFocusFallback) ||
      (Boolean(economicBuild) && !buildScanUsedFocusFallback) ||
      (Boolean(fortBuild) && !buildScanUsedFocusFallback) ||
      (Boolean(siegeOutpostBuild) && !buildScanUsedFocusFallback),
    // Debug-only: what chooseBestEconomicBuild actually picked, so a
    // repeatedly-rejected BUILD_ECONOMIC_STRUCTURE can be traced to a
    // specific tile/type via /admin/debug/ai/decisions instead of guessing.
    ...(economicBuild
      ? { economicBuildCandidate: `${economicBuild.tile.x},${economicBuild.tile.y}:${economicBuild.structureType}` }
      : {}),
    ...(typeof input.playerScopeKeyCount === "number" ? { playerScopeKeyCount: input.playerScopeKeyCount } : {}),
    ...(typeof input.playerScopeTileCount === "number" ? { playerScopeTileCount: input.playerScopeTileCount } : {})
  };

  const context: AutomationPlannerDecisionContext<TTile> = {
    playerId: input.playerId,
    clientSeq: input.clientSeq,
    issuedAt: input.issuedAt,
    sessionPrefix: input.sessionPrefix,
    diagnostic: diagnosticBase,
    frontierAnalysis,
    tilesByKey: input.tilesByKey,
    needsFood,
    needsEconomy,
    ...(input.preplanProgressState ? { preplanProgressState: input.preplanProgressState } : {})
  };
  const summarizeStartedAt = Date.now();
  const preferredEnemyAttack = frontierAnalysis.enemyAttack ?? (frontierAnalysis.frontierEnemyPlayerTargetCount === 0 ? frontierAnalysis.attack : undefined);

  // buildAutomationStrategicSnapshot only ever needs settled tiles carrying
  // a resource/dockId/town (for victory-path scoring) — every such tile is
  // already guaranteed to be in buildCandidateTiles (isBuildCandidateTile in
  // planner-candidate-index.ts includes resource || dockId || town), so this
  // is a lossless substitution that avoids yet another O(owned) scan.
  const strategicOwnedTiles = input.buildCandidateTiles?.length ? input.buildCandidateTiles : input.ownedTiles;
  const strategic = buildAutomationStrategicSnapshot({
    playerId: input.playerId,
    points: input.points,
    manpower: input.manpower,
    settledTileCount,
    controlledTileCount,
    townCount,
    incomePerMinute,
    ...(input.strategicResources ? { strategicResources: input.strategicResources } : {}),
    ownedTiles: strategicOwnedTiles,
    tilesByKey: input.tilesByKey,
    frontierAnalysis,
    needsFood,
    needsEconomy,
    canAttack,
    canExpand,
    economicBuildAvailable: Boolean(economicBuild),
    fortBuildAvailable: Boolean(fortBuild),
    siegeOutpostBuildAvailable: Boolean(siegeOutpostBuild),
    ...(input.previousVictoryPath ? { previousVictoryPath: input.previousVictoryPath } : {}),
    ...(input.pathPopulationCounts ? { pathPopulationCounts: input.pathPopulationCounts } : {}),
    ...(typeof input.activeMusterCount === "number" ? { activeMusterCount: input.activeMusterCount } : {}),
    ...(input.musterTileKeys ? { musterTileKeys: input.musterTileKeys } : {})
  });
  input.onStrategicSnapshot?.(strategic);

  recordPhaseTiming("summarize_frontier", summarizeStartedAt);
  return runUtilityPolicy({
    context,
    strategic,
    canAttack,
    canExpand,
    devSlotAvailable: effectiveDevelopmentProcessCount < DEVELOPMENT_PROCESS_LIMIT,
    preferredEnemyAttack,
    economicBuild,
    fortBuild,
    siegeOutpostBuild,
    attackStalemateTargetTileKeys: input.attackStalemateTargetTileKeys,
    expansionObjective: input.expansionObjective,
    points: input.points,
    manpower: input.manpower,
    decisionCooldowns: input.decisionCooldowns
  });
};
