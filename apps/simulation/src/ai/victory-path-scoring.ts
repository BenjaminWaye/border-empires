// Victory-path selection for the AI strategic snapshot. Split out of
// automation-strategic-snapshot.ts, which was at the file-line cap.
//
// Two scoring modes:
//   - World standings (worldVictoryProgress present): progress is the real
//     0..1 season-victory progress the simulation computes for this player
//     (computeSeasonVictory, 1 = that path's win condition is met). Paths are
//     ranked by it, so the AI aims at the objective it can actually win.
//   - Heuristic fallback (no standings yet, the direct non-worker planner,
//     tests): the original self-relative targets below. These compare the AI
//     with itself, not the world (e.g. "6 tiles of one resource" for an 80%
//     monopoly), so they read as "already winning" almost immediately — never
//     prefer them when standings are available.
import { GOLD_RESCALE_DIVISOR, type DomainTileState } from "@border-empires/game-domain";

import type { FrontierAnalysis } from "./frontier-command-planner.js";

export type AutomationVictoryPath =
  | "TOWN_CONTROL"
  | "ECONOMIC_HEGEMONY"
  | "RESOURCE_MONOPOLY"
  | "MARITIME_SUPREMACY"
  | "DIPLOMATIC_DOMINANCE";

/** Real per-path season-victory progress for one player (0..1, 1 = condition met). */
export type WorldVictoryProgress = Partial<Record<AutomationVictoryPath, number>>;

export type StrategicTile = {
  x: number;
  y: number;
  terrain: DomainTileState["terrain"];
  ownerId?: string | undefined;
  ownershipState?: string | undefined;
  dockId?: string | undefined;
  resource?: DomainTileState["resource"] | undefined;
  town?: unknown;
};

export type VictoryPathScore = {
  score: number;
  contender: boolean;
  softContender: boolean;
  /** Progress ratio toward that path's contender threshold (§7.2 of
   *  docs/ai-structure-building-rewrite-plan.md) — the same ratio that
   *  produces `contender`/`softContender` above, exported so callers don't
   *  have to re-derive it. Heuristic mode is not clamped to [0, 1]: a
   *  dominant empire can run well past 1, and a caller wanting a deficit
   *  should clamp itself (see build-need-vector.ts's VICTORY need). */
  progress: number;
};

export type VictoryPathScoringInput<TTile extends StrategicTile> = {
  playerId: string;
  settledTileCount: number;
  controlledTileCount: number;
  townCount: number;
  incomePerMinute: number;
  ownedTiles: readonly TTile[];
  frontierAnalysis: FrontierAnalysis;
  needsFood: boolean;
  needsEconomy: boolean;
  economicBuildAvailable: boolean;
  previousVictoryPath?: AutomationVictoryPath | undefined;
  pathPopulationCounts?: Partial<Record<AutomationVictoryPath, number>> | undefined;
  worldVictoryProgress?: WorldVictoryProgress | undefined;
};

const VICTORY_PATHS: readonly AutomationVictoryPath[] = [
  "TOWN_CONTROL",
  "ECONOMIC_HEGEMONY",
  "RESOURCE_MONOPOLY",
  "MARITIME_SUPREMACY",
  "DIPLOMATIC_DOMINANCE"
];
const VICTORY_PATH_REPIVOT_MARGIN = 28;
const VICTORY_PATH_EMERGENCY_REPIVOT_MARGIN = 56;
const VICTORY_PATH_POPULATION_PENALTY = 18;
const VICTORY_PATH_CONTENDER_PROGRESS_RATIO = 0.72;
const VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO = 0.58;
const VICTORY_PATH_CONTENDER_ECONOMY_RATIO = 1;
const VICTORY_PATH_SOFT_CONTENDER_ECONOMY_RATIO = 0.8;
// World mode scores progress on a 0..1000 scale, so the repivot margins
// (28/56) mean "another path is 2.8%/5.6% closer to its win" and each extra
// AI crowding a path costs 1.8%.
const WORLD_PROGRESS_SCORE_SCALE = 1_000;
// World mode still ranks paths by the situational heuristic (food, frontier
// opportunities, dock crossings, attack targets) and adds a small bonus by
// rank. Every bonus gap is below VICTORY_PATH_REPIVOT_MARGIN, so the heuristic
// alone never flips a held path — it only breaks near-ties, e.g. at season
// start when every path's real progress is ~0.
const HEURISTIC_RANK_BONUS = [20, 14, 8, 4, 0] as const;

export const targetRequiresDockCrossing = (
  selection:
    | FrontierAnalysis["attack"]
    | FrontierAnalysis["expand"]
    | FrontierAnalysis["economicExpand"]
    | FrontierAnalysis["scaffoldExpand"]
    | FrontierAnalysis["scoutExpand"]
): boolean =>
  Boolean(
    selection &&
      (
        (selection.from.dockId && selection.target.dockId) ||
        Math.abs(selection.from.x - selection.target.x) > 1 ||
        Math.abs(selection.from.y - selection.target.y) > 1
      )
  );

const ownedResourceTileCounts = <TTile extends StrategicTile>(
  playerId: string,
  ownedTiles: readonly TTile[]
): Map<NonNullable<DomainTileState["resource"]>, number> => {
  const counts = new Map<NonNullable<DomainTileState["resource"]>, number>();
  for (const tile of ownedTiles) {
    if (tile.ownerId !== playerId || tile.ownershipState !== "SETTLED" || !tile.resource) continue;
    counts.set(tile.resource, (counts.get(tile.resource) ?? 0) + 1);
  }
  return counts;
};

const ownedDockTileCount = <TTile extends StrategicTile>(
  playerId: string,
  ownedTiles: readonly TTile[]
): number => {
  let count = 0;
  for (const tile of ownedTiles) {
    if (tile.ownerId === playerId && tile.ownershipState === "SETTLED" && tile.dockId) count += 1;
  }
  return count;
};

const crowdingPenaltyFor = (
  pathPopulationCounts: VictoryPathScoringInput<StrategicTile>["pathPopulationCounts"]
): ((path: AutomationVictoryPath, contender: boolean, softContender: boolean) => number) => {
  const populationOf = (path: AutomationVictoryPath): number => pathPopulationCounts?.[path] ?? 0;
  const minimumPopulation = Math.min(...VICTORY_PATHS.map(populationOf));
  return (path, contender, softContender) => {
    const overMinimum = Math.max(0, populationOf(path) - minimumPopulation);
    if (contender) return 0;
    if (softContender) return Math.max(0, overMinimum * VICTORY_PATH_POPULATION_PENALTY - Math.round(VICTORY_PATH_POPULATION_PENALTY * 0.7));
    return overMinimum * VICTORY_PATH_POPULATION_PENALTY;
  };
};

const scoreVictoryPathsFromWorld = (
  world: WorldVictoryProgress,
  heuristic: Record<AutomationVictoryPath, VictoryPathScore>,
  pathPopulationCounts: VictoryPathScoringInput<StrategicTile>["pathPopulationCounts"]
): Record<AutomationVictoryPath, VictoryPathScore> => {
  const crowdingPenalty = crowdingPenaltyFor(pathPopulationCounts);
  const heuristicRank = [...VICTORY_PATHS].sort((left, right) => heuristic[right].score - heuristic[left].score);
  const entries = VICTORY_PATHS.map((path): [AutomationVictoryPath, VictoryPathScore] => {
    const progress = Math.max(0, Math.min(1, world[path] ?? 0));
    const contender = progress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
    const softContender = progress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
    const situationalBonus = HEURISTIC_RANK_BONUS[heuristicRank.indexOf(path)] ?? 0;
    return [path, { score: progress * WORLD_PROGRESS_SCORE_SCALE + situationalBonus - crowdingPenalty(path, contender, softContender), contender, softContender, progress }];
  });
  return Object.fromEntries(entries) as Record<AutomationVictoryPath, VictoryPathScore>;
};

export const scoreVictoryPaths = <TTile extends StrategicTile>(
  input: VictoryPathScoringInput<TTile>
): Record<AutomationVictoryPath, VictoryPathScore> => {
  const heuristic = scoreVictoryPathsHeuristic(input);
  return input.worldVictoryProgress ? scoreVictoryPathsFromWorld(input.worldVictoryProgress, heuristic, input.pathPopulationCounts) : heuristic;
};

const scoreVictoryPathsHeuristic = <TTile extends StrategicTile>(
  input: VictoryPathScoringInput<TTile>
): Record<AutomationVictoryPath, VictoryPathScore> => {
  const islandGrowthAvailable =
    targetRequiresDockCrossing(input.frontierAnalysis.expand) ||
    targetRequiresDockCrossing(input.frontierAnalysis.economicExpand);
  const townsTarget = Math.max(2, Math.ceil(Math.max(1, input.settledTileCount) / 5));
  const controlledTileCount = input.controlledTileCount;
  const diplomaticControlTarget = Math.max(4, input.townCount * 3);
  // §24.5: economyTarget/economicHegemonyScore's income term are both
  // expressed in old (pre-§6.1) gold/min units in this scoring model — divide
  // by the same GOLD_RESCALE_DIVISOR (§6.1) the real income source constants
  // went through, so economyProgress (income/target, compared against the
  // VICTORY_PATH_*_ECONOMY_RATIO constants below) keeps meaning what it
  // always meant, rather than permanently reading near-zero once
  // incomePerMinute itself shrank ~288x.
  const economyTarget = Math.max(8, input.settledTileCount * 0.55) / GOLD_RESCALE_DIVISOR;
  const townProgress = input.townCount / townsTarget;
  const diplomaticControlProgress = controlledTileCount / diplomaticControlTarget;
  const economyProgress = input.incomePerMinute / economyTarget;

  const resourceCounts = ownedResourceTileCounts(input.playerId, input.ownedTiles);
  // Find the resource type the AI has accumulated the most of — this is the
  // candidate resource for a RESOURCE_MONOPOLY win. Concentration matters more
  // than absolute count for path-selection (the win threshold is 80% of one
  // resource type globally, so AI needs to focus on a single type).
  let topResourceCount = 0;
  for (const value of resourceCounts.values()) {
    if (value > topResourceCount) topResourceCount = value;
  }
  const dockCount = ownedDockTileCount(input.playerId, input.ownedTiles);

  // RESOURCE_MONOPOLY contender progress is approximated by raw concentration:
  // 4 tiles of one resource ≈ contender, 6+ ≈ strong contender. Without
  // world-wide totals in scope we can't compute the real 80%-monopoly ratio.
  const resourceMonopolyTarget = 6;
  const resourceMonopolyProgress = topResourceCount / resourceMonopolyTarget;

  // MARITIME_SUPREMACY progress is approximated by settled dock count. The
  // authoritative world dock target only exists in the status scorer.
  const maritimeSupremacyTarget = 3;
  const maritimeSupremacyProgress = dockCount / maritimeSupremacyTarget;

  const townControlScore =
    input.townCount * 140 +
    input.frontierAnalysis.frontierEnemyTargetCount * 22 +
    (input.frontierAnalysis.attack ? Math.min(140, Math.max(0, input.frontierAnalysis.attack.score - 120) * 0.35) : 0) +
    (!input.needsFood && !input.needsEconomy ? 24 : -30);
  const economicHegemonyScore =
    input.incomePerMinute * 18 * GOLD_RESCALE_DIVISOR +
    (input.economicBuildAvailable ? 110 : 0) +
    input.frontierAnalysis.frontierOpportunityEconomic * 44 +
    (!input.needsFood ? 18 : -24) +
    (input.needsEconomy ? -12 : 0);
  const diplomaticDominanceScore =
    controlledTileCount * 18 +
    input.frontierAnalysis.frontierNeutralTargetCount * 18 +
    input.frontierAnalysis.frontierOpportunityScout * 10 +
    input.frontierAnalysis.frontierOpportunityScaffold * 8 +
    (islandGrowthAvailable ? 120 : 0) +
    (!input.needsFood && !input.needsEconomy ? 18 : -18);
  const resourceMonopolyScore =
    topResourceCount * 60 +
    input.frontierAnalysis.frontierOpportunityEconomic * 22 +
    (input.economicBuildAvailable ? 40 : 0) +
    (!input.needsFood && !input.needsEconomy ? 16 : -20);
  // MARITIME_SUPREMACY is the multi-dock naval path. A single dock is still
  // broad diplomatic expansion; require at least two docks before naval growth
  // dominates path choice.
  const maritimeSupremacyScore =
    dockCount * 60 +
    (dockCount >= 2 && islandGrowthAvailable ? 160 : 0) +
    (!input.needsFood ? 12 : -16);
  const crowdingPenalty = crowdingPenaltyFor(input.pathPopulationCounts);
  const townControlContender = townProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const townControlSoftContender = townProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
  const economicContender = economyProgress >= VICTORY_PATH_CONTENDER_ECONOMY_RATIO;
  const economicSoftContender = economyProgress >= VICTORY_PATH_SOFT_CONTENDER_ECONOMY_RATIO;
  const diplomaticDominanceContender = diplomaticControlProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const diplomaticDominanceSoftContender = diplomaticControlProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
  const resourceMonopolyContender = resourceMonopolyProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const resourceMonopolySoftContender = resourceMonopolyProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;
  const maritimeSupremacyContender = maritimeSupremacyProgress >= VICTORY_PATH_CONTENDER_PROGRESS_RATIO;
  const maritimeSupremacySoftContender = maritimeSupremacyProgress >= VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO;

  return {
    TOWN_CONTROL: {
      score: townControlScore - crowdingPenalty("TOWN_CONTROL", townControlContender, townControlSoftContender),
      contender: townControlContender,
      softContender: townControlSoftContender,
      progress: townProgress
    },
    ECONOMIC_HEGEMONY: {
      score: economicHegemonyScore - crowdingPenalty("ECONOMIC_HEGEMONY", economicContender, economicSoftContender),
      contender: economicContender,
      softContender: economicSoftContender,
      progress: economyProgress
    },
    RESOURCE_MONOPOLY: {
      score: resourceMonopolyScore - crowdingPenalty("RESOURCE_MONOPOLY", resourceMonopolyContender, resourceMonopolySoftContender),
      contender: resourceMonopolyContender,
      softContender: resourceMonopolySoftContender,
      progress: resourceMonopolyProgress
    },
    MARITIME_SUPREMACY: {
      score: maritimeSupremacyScore - crowdingPenalty("MARITIME_SUPREMACY", maritimeSupremacyContender, maritimeSupremacySoftContender),
      contender: maritimeSupremacyContender,
      softContender: maritimeSupremacySoftContender,
      progress: maritimeSupremacyProgress
    },
    DIPLOMATIC_DOMINANCE: {
      score: diplomaticDominanceScore - crowdingPenalty("DIPLOMATIC_DOMINANCE", diplomaticDominanceContender, diplomaticDominanceSoftContender),
      contender: diplomaticDominanceContender,
      softContender: diplomaticDominanceSoftContender,
      progress: diplomaticControlProgress
    }
  };
};

export const chooseVictoryPath = <TTile extends StrategicTile>(
  input: VictoryPathScoringInput<TTile>
): { path: AutomationVictoryPath; progress: number } => {
  const scores = scoreVictoryPaths(input);
  const withProgress = (path: AutomationVictoryPath): { path: AutomationVictoryPath; progress: number } => ({
    path,
    progress: scores[path].progress
  });
  const best = (Object.entries(scores) as Array<[AutomationVictoryPath, VictoryPathScore]>).sort(
    (left, right) => right[1].score - left[1].score
  )[0];
  const previous = input.previousVictoryPath;
  if (!previous) return withProgress(best?.[0] ?? "DIPLOMATIC_DOMINANCE");

  const previousScore = scores[previous];
  // A real contender holds its path — unless another path's win condition is
  // already met (world progress 1) and this one's isn't: then defend the hold
  // that is actually running. Heuristic progress runs past 1, so world only.
  const anotherPathWon = Boolean(input.worldVictoryProgress) && best !== undefined && best[0] !== previous && best[1].progress >= 1 && previousScore.progress < 1;
  if (previousScore.contender && !anotherPathWon) return withProgress(previous);
  if (!best) return withProgress(previous);
  if (best[0] === previous) return withProgress(previous);
  if (previousScore.softContender && best[1].score < previousScore.score + VICTORY_PATH_EMERGENCY_REPIVOT_MARGIN) {
    return withProgress(previous);
  }
  if (best[1].score < previousScore.score + VICTORY_PATH_REPIVOT_MARGIN) return withProgress(previous);
  return withProgress(best[0]);
};
