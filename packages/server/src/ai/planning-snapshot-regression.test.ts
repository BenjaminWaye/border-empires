import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../main.ts"), "utf8");
};

const aiIndexStoreSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../sim/ai-index-store.ts"), "utf8");
};

const functionBody = (source: string, functionName: string): string => {
  const start = source.indexOf(`const ${functionName} =`);
  if (start === -1) throw new Error(`Could not find function ${functionName}`);
  const arrow = source.indexOf("=>", start);
  if (arrow === -1) throw new Error(`Could not find arrow for ${functionName}`);
  const open = source.indexOf("{", arrow);
  if (open === -1) throw new Error(`Could not find opening brace for ${functionName}`);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
};

describe("buildAiPlanningSnapshot regression guard", () => {
  it("does not eagerly recompute heavy AI candidates just to build the planner snapshot", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningSnapshot");
    const forbiddenCalls = [
      "bestAiOpeningScoutExpand(",
      "bestAiEconomicExpand(",
      "bestAiScoutExpand(",
      "bestAiScaffoldExpand(",
      "bestAiAnyNeutralExpand(",
      "bestAiFrontierAction(",
      "bestAiEnemyPressureAttack(",
      "bestAiSettlementTile(",
      "bestAiFortTile(",
      "bestAiEconomicStructure("
    ];

    for (const forbidden of forbiddenCalls) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("keeps planning static on lightweight availability profiles instead of concrete selector scans", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    expect(body).toContain("const settlementAvailability = estimateAiSettlementAvailabilityProfile(actor, territorySummary, focusIslandId, economyWeak, foodCoverageLow);");
    expect(body).toContain("const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);");
    expect(body).not.toContain("frontierPlanningSummaryForPlayer(");
    expect(body).not.toContain("frontierSettlementSummaryForPlayer(");
    expect(body).not.toContain("bestAiEconomicExpand(");
    expect(body).not.toContain("bestAiScoutExpand(");
    expect(body).not.toContain("bestAiScaffoldExpand(");
    expect(body).not.toContain("bestAiFrontierAction(");
    expect(body).not.toContain("bestAiEnemyPressureAttack(");
    expect(body).not.toContain("bestAiFortTile(");
    expect(body).not.toContain("bestAiEconomicStructure(");
  });

  it("stores lightweight availability and pressure metadata without concrete cached handles", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    expect(body).toContain("const pressureAttackProfile = estimateAiPressureAttackProfile(actor, territorySummary);");
    expect(body).toContain("const islandExpandAvailable = hasAiFocusedIslandExpand(territorySummary, focusIslandId, undercoveredIslandCount);");
    expect(body).toContain("barbarianAttackAvailable: territorySummary.barbarianAttackAvailable");
    expect(body).toContain("enemyAttackAvailable: territorySummary.enemyAttackAvailable");
    expect(body).not.toContain("openingScoutExpand:");
    expect(body).not.toContain("settlementTileIndex:");
    expect(body).not.toContain("economicBuild:");
  });

  it("keeps planning static on the cheap frontier availability path and leaves frontier summary for dedicated selectors", () => {
    const source = serverMainSource();
    expect(source).toContain("const frontierPlanningSummaryForPlayer =");
    const body = functionBody(source, "buildAiPlanningStaticCache");
    const availabilityBody = functionBody(source, "frontierPlanningSummaryForPlayer");
    expect(body).toContain("const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);");
    expect(body).not.toContain("frontierPlanningSummaryForPlayer(actor, territorySummary)");
    expect(availabilityBody).toContain("const scoutValue = scoreAiScoutRevealValue(actor, to, visibility, territorySummary);");
    expect(availabilityBody).toContain("const economicSignal = aiEconomicFrontierSignal(actor, to, visibility, territorySummary.foodPressure, territorySummary);");
    expect(availabilityBody).toContain("cachedSupportedTownKeysForTile(actor.id, tileKey, territorySummary)");
    expect(availabilityBody).toContain("bestOpeningScoutExpand");
  });

  it("uses execute-time selectors once a concrete action has been chosen", () => {
    const runBody = functionBody(serverMainSource(), "runAiTurn");
    expect(runBody).toContain("const planningStatic = cachedAiPlanningStaticForPlayer(actor, territorySummary, primaryVictoryPath);");
    expect(runBody).toContain("const opening = bestAiOpeningScoutExpand(actor, territorySummary);");

    const executeBody = functionBody(serverMainSource(), "executeAiGoapAction");
    expect(executeBody).toContain("bestAiEconomicExpand(");
    expect(executeBody).toContain("bestAiScaffoldExpand(");
    expect(executeBody).toContain("bestAiEnemyPressureAttack(");
    expect(executeBody).toContain("bestAiFortTile(");
    expect(executeBody).toContain("bestAiEconomicStructure(");
  });

  it("keeps scout execute focused on the dedicated scout selector", () => {
    const body = functionBody(serverMainSource(), "executeAiGoapAction");
    const scoutBranchStart = body.indexOf('if (actionKey === "claim_scout_border_tile")');
    expect(scoutBranchStart).toBeGreaterThanOrEqual(0);
    const scoutBranch = body.slice(scoutBranchStart, body.indexOf('if (actionKey === "claim_scaffold_border_tile")', scoutBranchStart));
    expect(scoutBranch).toContain("const candidate = bestAiScoutExpand(actor, territorySummary);");
    expect(scoutBranch).not.toContain("bestAiAnyNeutralExpand(");
  });

  it("keeps neutral execute off the heavy planning-static frontier summary path", () => {
    const body = functionBody(serverMainSource(), "executeAiGoapAction");
    const neutralBranchStart = body.indexOf('if (actionKey === "claim_neutral_border_tile")');
    expect(neutralBranchStart).toBeGreaterThanOrEqual(0);
    const neutralBranch = body.slice(neutralBranchStart, body.indexOf('if (actionKey === "claim_food_border_tile")', neutralBranchStart));
    expect(neutralBranch).toContain('victoryPath === "SETTLED_TERRITORY" ? bestAiIslandExpand(actor, territorySummary) : undefined');
    expect(neutralBranch).toContain("bestAiEconomicExpand(actor, victoryPath, territorySummary)");
    expect(neutralBranch).toContain("bestAiAnyNeutralExpand(actor, victoryPath, territorySummary)");
    expect(neutralBranch).not.toContain("frontierPlanningSummaryForPlayer(");
  });

  it("keeps scaffold execute on dedicated selectors instead of planning-static refs", () => {
    const body = functionBody(serverMainSource(), "executeAiGoapAction");
    const scaffoldBranchStart = body.indexOf('if (actionKey === "claim_scaffold_border_tile")');
    expect(scaffoldBranchStart).toBeGreaterThanOrEqual(0);
    const scaffoldBranch = body.slice(scaffoldBranchStart, body.indexOf('if (actionKey === "attack_barbarian_border_tile")', scaffoldBranchStart));
    expect(scaffoldBranch).toContain("bestAiScaffoldExpand(actor, victoryPath, territorySummary)");
    expect(scaffoldBranch).toContain("bestAiEconomicExpand(actor, victoryPath, territorySummary)");
    expect(scaffoldBranch).toContain("bestAiAnyNeutralExpand(actor, victoryPath, territorySummary)");
  });

  it("keeps food execute on the economic selector only", () => {
    const body = functionBody(serverMainSource(), "executeAiGoapAction");
    const foodBranchStart = body.indexOf('if (actionKey === "claim_food_border_tile")');
    expect(foodBranchStart).toBeGreaterThanOrEqual(0);
    const foodBranch = body.slice(foodBranchStart, body.indexOf('if (actionKey === "claim_scout_border_tile")', foodBranchStart));
    expect(foodBranch).toContain("const candidate = bestAiEconomicExpand(actor, victoryPath, territorySummary);");
    expect(foodBranch).not.toContain("bestAiAnyNeutralExpand(");
  });

  it("keeps planning static lightweight while execute-time branches are allowed to call budgeted selectors", () => {
    const source = serverMainSource();
    const executeBody = functionBody(source, "executeAiGoapAction");
    expect(executeBody).toContain("bestAiEconomicExpand(");
    expect(executeBody).toContain("bestAiSettlementTile(");
    expect(executeBody).toContain("bestAiFortTile(");
    expect(executeBody).not.toContain("collectAiTerritorySummary(actor)");
  });

  it("reuses persistent scout frontier caches instead of rebuilding reveal and adjacency scoring every turn", () => {
    const source = serverMainSource();
    const collectBody = functionBody(source, "collectAiTerritorySummary");
    const scoreScoutBody = functionBody(source, "scoreAiScoutExpandCandidate");
    const openingScoutBody = functionBody(source, "bestAiOpeningScoutExpand");
    const revealBody = functionBody(source, "scoreAiScoutRevealValue");

    expect(source).toContain("type AiScoutAdjacencyMetrics =");
    expect(source).toContain("const cachedScoutAdjacencyMetrics =");
    expect(collectBody).toContain("scoutRevealCountByTileKey: cached.scoutRevealCountByTileKey");
    expect(collectBody).toContain("scoutRevealValueByProfileKey: cached.scoutRevealValueByProfileKey");
    expect(collectBody).toContain("scoutAdjacencyByTileKey: cached.scoutAdjacencyByTileKey");
    expect(collectBody).toContain("scoutRevealMarks: cached.scoutRevealMarks");
    expect(scoreScoutBody).toContain("cachedScoutAdjacencyMetrics(actor, to, territorySummary)");
    expect(openingScoutBody).toContain("frontierPlanningSummaryForPlayer(actor, territorySummary).bestOpeningScoutExpand");
    expect(revealBody).toContain("const profileKey = `${territorySummary.foodPressure > 0 ? 1 : 0}:${economyWeak ? 1 : 0}:${tk}`;");
  });

  it("keeps victory-path scoring on cheap cached territory signals", () => {
    const source = serverMainSource();
    expect(source).toContain("const townOpportunityScore = territorySummary.neutralTownExpandCount * 5 + territorySummary.hostileTownAttackCount * 6;");
    expect(source).toContain("const economicOpportunityScore = territorySummary.neutralEconomicExpandCount * 4 + territorySummary.hostileEconomicAttackCount * 3;");
    expect(source).toContain("const expansionOpportunityScore = territorySummary.neutralLandExpandCount + Math.min(territorySummary.frontierTileCount, 24);");
    expect(source).toContain("const populationCounts = aiVictoryPathPopulationCounts();");
    expect(source).toContain("Math.max(0, populationCounts[entry.id] - minimumPopulation) * AI_VICTORY_PATH_POPULATION_PENALTY");
    const body = functionBody(source, "scoreAiVictoryPathChoices");
    expect(body).not.toContain("frontierPlanningSummaryForPlayer(");
  });

  it("uses cached strategic posture and lightweight shard-or-truce handling", () => {
    const chooseStrategicBody = functionBody(serverMainSource(), "chooseAiStrategicState");
    const truceBody = functionBody(serverMainSource(), "maybeHandleAiShardOrTruce");

    expect(chooseStrategicBody).toContain("AI_STRATEGIC_STATE_TTL_MS");
    expect(chooseStrategicBody).toContain("\"TRUCE\"");
    expect(chooseStrategicBody).toContain("\"ISLAND_FOOTPRINT\"");
    expect(chooseStrategicBody).toContain("\"SHARD_RUSH\"");
    expect(chooseStrategicBody).toContain("islandMeaningfulOpportunity");
    expect(chooseStrategicBody).toContain("islandWasteDominated");
    expect(truceBody).toContain("bestAiCollectShardTile");
    expect(truceBody).toContain("strategicState.focus === \"SHARD_RUSH\"");
    expect(truceBody).toContain("TRUCE_REQUEST");
    expect(truceBody).toContain("TRUCE_ACCEPT");
  });

  it("does not advertise or select settlement targets that are already settling", () => {
    const staticBody = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    const frontierSummaryBody = functionBody(serverMainSource(), "frontierSettlementSummaryForPlayer");
    const settlementBody = functionBody(serverMainSource(), "bestAiSettlementTile");
    const islandSettlementBody = functionBody(serverMainSource(), "bestAiIslandSettlementTile");
    const townSupportSettlementBody = functionBody(serverMainSource(), "bestAiTownSupportSettlementTile");
    const evaluationBody = functionBody(serverMainSource(), "evaluateAiSettlementCandidate");
    const fortBody = functionBody(serverMainSource(), "bestAiFortTile");

    expect(staticBody).toContain("const settlementAvailability = estimateAiSettlementAvailabilityProfile(actor, territorySummary, focusIslandId, economyWeak, foodCoverageLow);");
    expect(frontierSummaryBody).toContain("tileHasPendingSettlement(tileKey)");
    expect(settlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(islandSettlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(townSupportSettlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(evaluationBody).toContain("ownershipStateByTile.get(tk)");
    expect(fortBody).toContain("fortsByTile.has(tk)");
    expect(fortBody).toContain("isBorderTile(tile.x, tile.y, actor.id)");
    expect(frontierSummaryBody).toContain("bestSettlementTileIndex:");
    expect(frontierSummaryBody).toContain("bestTownSupportSettlementTileIndex:");
    expect(frontierSummaryBody).toContain("bestIslandSettlementTileIndex:");
  });

  it("invalidates cached settlement selectors when AI territory changes", () => {
    const body = functionBody(aiIndexStoreSource(), "markTerritoryDirtyForPlayers");
    expect(body).toContain("settlementSelectorByPlayer.delete(playerId)");
    expect(serverMainSource()).toContain("const markAiTerritoryDirtyForPlayers = aiIndexStore.markTerritoryDirtyForPlayers;");
  });

  it("keeps island-victory focus targeted and avoids treating fully fed empires as food emergencies", () => {
    const source = serverMainSource();
    const turnAnalysisBody = functionBody(serverMainSource(), "buildAiTurnAnalysis");
    const staticBody = functionBody(serverMainSource(), "buildAiPlanningStaticCache");

    expect(source).toContain("const bestAiIslandFocusTargetId =");
    expect(source).toContain("const focusIslandId = bestAiIslandFocusTargetId(actor, territorySummary);");
    expect(source).toContain("const foodCoverageLow = controlledTowns > 0 && currentFoodCoverageForPlayer(actor.id) < 1;");
    expect(staticBody).toContain("const focusIslandId = bestAiIslandFocusTargetId(actor, territorySummary);");
    expect(staticBody).toContain("weakestIslandRatio = focusLand > 0 ? (islandProgress.settledCounts.get(focusIslandId) ?? 0) / focusLand : islandProgress.weakestRatio;");
    expect(turnAnalysisBody).toContain("foodCoverage < 1");
  });

  it("rarely re-evaluates locked victory paths instead of freezing them forever", () => {
    const ensureBody = functionBody(serverMainSource(), "ensureAiVictoryPath");

    expect(ensureBody).toContain("AI_VICTORY_PATH_REEVALUATE_MS");
    expect(ensureBody).toContain("scoreAiVictoryPathChoices(actor, analysis, townsTarget, settledTilesTarget)");
    expect(ensureBody).toContain("best.score >= currentScore + AI_VICTORY_PATH_REPIVOT_MARGIN");
  });

  it("avoids queueing behind a busy planner worker for cheap planner decisions", () => {
    const body = functionBody(serverMainSource(), "planAiDecisionViaWorker");
    expect(body).toContain('if (aiPlannerWorkerState.pending > 0)');
    expect(body).toContain('return resolveAiPlannerFallback(snapshot, "worker_backpressure");');
  });

  it("deduplicates frontier candidates before heavy planning scans", () => {
    const body = functionBody(serverMainSource(), "buildAiTerritoryStructureCache");
    expect(body).toContain("const expandCandidateByTarget = new Map<TileKey, AiFrontierCandidatePair>();");
    expect(body).toContain("const attackCandidateByTarget = new Map<TileKey, AiFrontierCandidatePair>();");
    expect(body).toContain("preferAiFrontierCandidate(");
    expect(body).toContain("const expandCandidates = [...expandCandidateByTarget.values()];");
    expect(body).toContain("const attackCandidates = [...attackCandidateByTarget.values()];");
  });
});
