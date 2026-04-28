import { rankSeasonVictoryPaths, type AiSeasonVictoryPathId } from "./ai/goap.js";
import type { Player } from "@border-empires/shared";
import type { AiTurnAnalysis } from "./server-ai-planning-types.js";

export interface CreateServerAiVictoryPathRuntimeDeps {
  aiVictoryPathByPlayer: Map<string, AiSeasonVictoryPathId>;
  aiVictoryPathUpdatedAtByPlayer: Map<string, number>;
  now: () => number;
  canAffordGoldCost: (points: number, cost: number) => boolean;
  frontierActionGoldCost: number;
  settleCost: number;
}

export interface ServerAiVictoryPathRuntime {
  chooseOpeningAiVictoryPath: (
    actor: Player,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ) => AiSeasonVictoryPathId;
  aiVictoryPathPopulationCounts: () => Record<AiSeasonVictoryPathId, number>;
  isAiVictoryPathContender: (
    victoryPath: AiSeasonVictoryPathId,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ) => boolean;
  scoreAiVictoryPathChoices: (
    actor: Player,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ) => Array<{ id: AiSeasonVictoryPathId; score: number }>;
  ensureAiVictoryPath: (
    actor: Player,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ) => AiSeasonVictoryPathId;
}

const AI_VICTORY_PATH_REEVALUATE_MS = 30 * 60_000;
const AI_VICTORY_PATH_REPIVOT_MARGIN = 22;
const AI_VICTORY_PATH_EMERGENCY_REPIVOT_MARGIN = 72;
const AI_VICTORY_PATH_ARCHETYPE_BONUS = 34;
const AI_VICTORY_PATH_POPULATION_PENALTY = 18;
const AI_VICTORY_PATH_CONTENDER_PROGRESS_RATIO = 0.72;
const AI_VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO = 0.58;
const AI_VICTORY_PATH_CONTENDER_ECONOMY_MIN = 140;
const AI_VICTORY_PATH_SOFT_CONTENDER_ECONOMY_MIN = 110;
const AI_VICTORY_PATH_CONTENDER_ECONOMY_GAP = -15;
const AI_VICTORY_PATH_SOFT_CONTENDER_ECONOMY_GAP = -30;

export const createServerAiVictoryPathRuntime = (
  deps: CreateServerAiVictoryPathRuntimeDeps
): ServerAiVictoryPathRuntime => {
  const aiVictoryPathPopulationCounts = (): Record<AiSeasonVictoryPathId, number> => {
    const counts: Record<AiSeasonVictoryPathId, number> = {
      TOWN_CONTROL: 0,
      ECONOMIC_HEGEMONY: 0,
      SETTLED_TERRITORY: 0
    };
    for (const path of deps.aiVictoryPathByPlayer.values()) counts[path] += 1;
    return counts;
  };

  const aiVictoryPathContenderBonus = (
    victoryPath: AiSeasonVictoryPathId,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): number => {
    const townProgress = townsTarget > 0 ? analysis.controlledTowns / townsTarget : 0;
    const settledProgress = settledTilesTarget > 0 ? analysis.settledTiles / settledTilesTarget : 0;
    const incomeGap = analysis.aiIncome - analysis.runnerUpIncome;
    if (victoryPath === "TOWN_CONTROL") return townProgress >= AI_VICTORY_PATH_CONTENDER_PROGRESS_RATIO ? 999 : townProgress >= AI_VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO ? Math.round(AI_VICTORY_PATH_POPULATION_PENALTY * 0.7) : 0;
    if (victoryPath === "SETTLED_TERRITORY") return settledProgress >= AI_VICTORY_PATH_CONTENDER_PROGRESS_RATIO ? 999 : settledProgress >= AI_VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO ? Math.round(AI_VICTORY_PATH_POPULATION_PENALTY * 0.7) : 0;
    if (analysis.aiIncome >= AI_VICTORY_PATH_CONTENDER_ECONOMY_MIN && incomeGap >= AI_VICTORY_PATH_CONTENDER_ECONOMY_GAP) return 999;
    if (analysis.aiIncome >= AI_VICTORY_PATH_SOFT_CONTENDER_ECONOMY_MIN && incomeGap >= AI_VICTORY_PATH_SOFT_CONTENDER_ECONOMY_GAP) return Math.round(AI_VICTORY_PATH_POPULATION_PENALTY * 0.7);
    return 0;
  };

  const isAiVictoryPathContender = (
    victoryPath: AiSeasonVictoryPathId,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): boolean => aiVictoryPathContenderBonus(victoryPath, analysis, townsTarget, settledTilesTarget) >= AI_VICTORY_PATH_POPULATION_PENALTY;

  const aiVictoryPathProgressRatio = (
    victoryPath: AiSeasonVictoryPathId,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): number => {
    if (victoryPath === "TOWN_CONTROL") return townsTarget > 0 ? analysis.controlledTowns / townsTarget : 0;
    if (victoryPath === "SETTLED_TERRITORY") return settledTilesTarget > 0 ? analysis.settledTiles / settledTilesTarget : 0;
    return Math.max(0, Math.min(1, analysis.aiIncome / AI_VICTORY_PATH_CONTENDER_ECONOMY_MIN));
  };

  const shouldForceAiVictoryRepivot = (
    existing: AiSeasonVictoryPathId,
    best: { id: AiSeasonVictoryPathId; score: number } | undefined,
    currentScore: number,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): boolean => {
    if (!best || best.id === existing) return false;
    if (isAiVictoryPathContender(existing, analysis, townsTarget, settledTilesTarget)) return false;
    if (best.score < currentScore + AI_VICTORY_PATH_EMERGENCY_REPIVOT_MARGIN) return false;

    const existingProgress = aiVictoryPathProgressRatio(existing, analysis, townsTarget, settledTilesTarget);
    if (existingProgress >= AI_VICTORY_PATH_SOFT_CONTENDER_PROGRESS_RATIO) return false;

    if (existing === "SETTLED_TERRITORY") {
      return (
        analysis.economyWeak ||
        analysis.underThreat ||
        analysis.territorySummary.neutralLandExpandCount < Math.max(6, Math.min(18, analysis.frontierTiles))
      );
    }
    if (existing === "ECONOMIC_HEGEMONY") {
      return analysis.economyWeak || (!analysis.worldFlags.has("active_town") && !analysis.worldFlags.has("active_dock"));
    }
    return analysis.territorySummary.hostileTownAttackCount <= 0 && analysis.territorySummary.enemyAttackAvailable === false;
  };

  const scoreAiVictoryPathChoices = (
    actor: Player,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): Array<{ id: AiSeasonVictoryPathId; score: number }> => {
    const territorySummary = analysis.territorySummary;
    const townOpportunityScore = territorySummary.neutralTownExpandCount * 5 + territorySummary.hostileTownAttackCount * 6;
    const economicOpportunityScore = territorySummary.neutralEconomicExpandCount * 4 + territorySummary.hostileEconomicAttackCount * 3;
    const expansionOpportunityScore = territorySummary.neutralLandExpandCount + Math.min(territorySummary.frontierTileCount, 24);
    const ranked = rankSeasonVictoryPaths({
      townsControlled: analysis.controlledTowns,
      townsTarget,
      incomePerMinute: analysis.aiIncome,
      incomeLeaderGap: analysis.aiIncome - analysis.runnerUpIncome,
      settledTiles: analysis.settledTiles,
      settledTilesTarget,
      underThreat: analysis.underThreat,
      goldHealthy: deps.canAffordGoldCost(actor.points, deps.settleCost + deps.frontierActionGoldCost),
      staminaHealthy: actor.stamina >= 0
    });
    const archetype = [...actor.id].reduce((total, char) => total + char.charCodeAt(0), 0) % 3;
    const populationCounts = aiVictoryPathPopulationCounts();
    const minimumPopulation = Math.min(populationCounts.TOWN_CONTROL, populationCounts.ECONOMIC_HEGEMONY, populationCounts.SETTLED_TERRITORY);
    const openingScores: Record<AiSeasonVictoryPathId, number> = {
      TOWN_CONTROL: townOpportunityScore * 42 + (analysis.controlledTowns === 0 ? 35 : 0) + (analysis.underThreat ? -15 : 0) + (archetype === 0 ? AI_VICTORY_PATH_ARCHETYPE_BONUS : 0),
      ECONOMIC_HEGEMONY: economicOpportunityScore * 40 + (analysis.worldFlags.has("active_dock") ? 28 : 0) + (analysis.worldFlags.has("active_town") ? 12 : 0) + (analysis.foodCoverageLow ? 10 : 0) + (archetype === 1 ? AI_VICTORY_PATH_ARCHETYPE_BONUS : 0),
      SETTLED_TERRITORY: expansionOpportunityScore * 3.5 + Math.min(territorySummary.neutralLandExpandCount, 18) * 0.3 + (analysis.underThreat ? -10 : 6) + (analysis.worldFlags.has("active_town") ? 6 : 0) + (archetype === 2 ? AI_VICTORY_PATH_ARCHETYPE_BONUS : 0)
    };
    return [...ranked]
      .map((entry) => ({
        id: entry.id,
        score: (() => {
          const crowdingPenalty = Math.max(0, populationCounts[entry.id] - minimumPopulation) * AI_VICTORY_PATH_POPULATION_PENALTY;
          const contenderBonus = aiVictoryPathContenderBonus(entry.id, analysis, townsTarget, settledTilesTarget);
          return openingScores[entry.id] + entry.score * 0.28 - Math.max(0, crowdingPenalty - contenderBonus);
        })()
      }))
      .sort((left, right) => right.score - left.score);
  };

  const chooseOpeningAiVictoryPath = (
    actor: Player,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): AiSeasonVictoryPathId => scoreAiVictoryPathChoices(actor, analysis, townsTarget, settledTilesTarget)[0]?.id ?? "ECONOMIC_HEGEMONY";

  const ensureAiVictoryPath = (
    actor: Player,
    analysis: AiTurnAnalysis,
    townsTarget: number,
    settledTilesTarget: number
  ): AiSeasonVictoryPathId => {
    const existing = deps.aiVictoryPathByPlayer.get(actor.id);
    const updatedAt = deps.aiVictoryPathUpdatedAtByPlayer.get(actor.id) ?? 0;
    if (existing) {
      const scored = scoreAiVictoryPathChoices(actor, analysis, townsTarget, settledTilesTarget);
      const best = scored[0];
      const currentScore = scored.find((entry) => entry.id === existing)?.score ?? Number.NEGATIVE_INFINITY;
      if (shouldForceAiVictoryRepivot(existing, best, currentScore, analysis, townsTarget, settledTilesTarget)) {
        deps.aiVictoryPathByPlayer.set(actor.id, best!.id);
        deps.aiVictoryPathUpdatedAtByPlayer.set(actor.id, deps.now());
        return best!.id;
      }
      if (deps.now() - updatedAt < AI_VICTORY_PATH_REEVALUATE_MS) return existing;
      deps.aiVictoryPathUpdatedAtByPlayer.set(actor.id, deps.now());
      if (best && best.id !== existing && !analysis.underThreat && best.score >= currentScore + AI_VICTORY_PATH_REPIVOT_MARGIN) {
        deps.aiVictoryPathByPlayer.set(actor.id, best.id);
        return best.id;
      }
      return existing;
    }
    const selected = chooseOpeningAiVictoryPath(actor, analysis, townsTarget, settledTilesTarget);
    deps.aiVictoryPathByPlayer.set(actor.id, selected);
    deps.aiVictoryPathUpdatedAtByPlayer.set(actor.id, deps.now());
    return selected;
  };

  return {
    chooseOpeningAiVictoryPath,
    aiVictoryPathPopulationCounts,
    isAiVictoryPathContender,
    scoreAiVictoryPathChoices,
    ensureAiVictoryPath
  };
};
