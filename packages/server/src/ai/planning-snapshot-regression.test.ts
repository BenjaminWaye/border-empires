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

  it("keeps the cached planning layer free of eager heavy selector scans", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    const forbiddenCalls = [
      "bestAiFrontierAction(",
      "bestAiEnemyPressureAttack(",
      "bestAiSettlementTile(",
      "bestAiTownSupportSettlementTile(",
      "bestAiIslandExpand(",
      "bestAiIslandSettlementTile(",
      "bestAiFortTile(",
      "bestAiEconomicExpand(",
      "bestAiEconomicStructure("
    ];

    for (const forbidden of forbiddenCalls) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("derives cached attack and build availability from lightweight cached signals", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    expect(body).toContain("const pressureAttackProfile = estimateAiPressureAttackProfile(actor, territorySummary);");
    expect(body).toContain("const settlementAvailability = estimateAiSettlementAvailabilityProfile(");
    expect(body).toContain("const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);");
    expect(body).toContain("islandExpandAvailable: hasAiFocusedIslandExpand(territorySummary, focusIslandId, undercoveredIslandCount)");
    expect(body).toContain("territorySummary.borderSettledTileKeys.has(tk)");
    expect(body).toContain("!fortsByTile.has(tk)");
    expect(body).toContain("barbarianAttackAvailable: territorySummary.barbarianAttackAvailable");
    expect(body).toContain("enemyAttackAvailable: territorySummary.enemyAttackAvailable");
    expect(body).not.toContain("frontierSettlementSummaryForPlayer(");
    expect(body).not.toContain("frontierPlanningSummaryForPlayer(");
    expect(body).not.toContain("evaluateAiSettlementCandidate(");
    expect(body).not.toContain("for (const { to } of territorySummary.attackCandidates)");
  });

  it("keeps frontier availability in planning static cache on a lightweight path", () => {
    const source = serverMainSource();
    expect(source).toContain("const estimateAiFrontierAvailabilityProfile =");
    const body = functionBody(source, "buildAiPlanningStaticCache");
    const availabilityBody = functionBody(source, "estimateAiFrontierAvailabilityProfile");
    expect(body).toContain("const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);");
    expect(availabilityBody).not.toContain("frontierPlanningSummaryForPlayer(");
    expect(availabilityBody).not.toContain("aiEconomicFrontierSignal(");
    expect(availabilityBody).not.toContain("scoreAiScoutRevealValue(");
    expect(availabilityBody).not.toContain("cachedSupportedTownKeysForTile(");
  });

  it("reuses cached frontier candidates during execute instead of rescanning heavy neutral expand selectors", () => {
    const runBody = functionBody(serverMainSource(), "runAiTurn");
    expect(runBody).toContain("const planningStatic = cachedAiPlanningStaticForPlayer(actor, territorySummary);");
    expect(runBody).not.toContain("neutralExpand: planningStatic.bestEconomicExpand");
    expect(runBody).not.toContain("anyNeutralExpand: planningStatic.bestAnyNeutralExpand");
    expect(runBody).not.toContain("scoutExpand: planningStatic.bestScoutExpand");
    expect(runBody).not.toContain("scaffoldExpand: planningStatic.bestScaffoldExpand");
    expect(runBody).not.toContain("islandExpand: planningStatic.bestIslandExpand");

    const executeBody = functionBody(serverMainSource(), "executeAiGoapAction");
    expect(executeBody).toContain("const cachedNeutralExpandCandidate = (): { from: Tile; to: Tile } | undefined =>");
    expect(executeBody).toContain("bestAiIslandExpand(actor, territorySummary)");
    expect(executeBody).toContain("bestAiEconomicExpand(actor, victoryPath, territorySummary)");
    expect(executeBody).toContain("bestAiAnyNeutralExpand(actor, victoryPath, territorySummary)");
    expect(executeBody).toContain("bestAiScoutExpand(actor, territorySummary)");
    expect(executeBody).toContain("bestAiScaffoldExpand(actor, victoryPath, territorySummary)");
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
    const availabilityBody = functionBody(serverMainSource(), "estimateAiSettlementAvailabilityProfile");
    const frontierSummaryBody = functionBody(serverMainSource(), "frontierSettlementSummaryForPlayer");
    const settlementBody = functionBody(serverMainSource(), "bestAiSettlementTile");
    const islandSettlementBody = functionBody(serverMainSource(), "bestAiIslandSettlementTile");
    const townSupportSettlementBody = functionBody(serverMainSource(), "bestAiTownSupportSettlementTile");
    const evaluationBody = functionBody(serverMainSource(), "evaluateAiSettlementCandidate");
    const fortBody = functionBody(serverMainSource(), "bestAiFortTile");

    expect(staticBody).toContain("estimateAiSettlementAvailabilityProfile(");
    expect(availabilityBody).toContain("tileHasPendingSettlement(tileKey)");
    expect(frontierSummaryBody).toContain("tileHasPendingSettlement(tileKey)");
    expect(settlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(islandSettlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(townSupportSettlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(evaluationBody).toContain("ownershipStateByTile.get(tk)");
    expect(fortBody).toContain("fortsByTile.has(tk)");
    expect(fortBody).toContain("isBorderTile(tile.x, tile.y, actor.id)");
    expect(availabilityBody).not.toContain('evaluateAiSettlementCandidate(actor, tile, "SETTLED_TERRITORY", undefined, territorySummary)');
    expect(availabilityBody).toContain("if (matchesFocus && (hasIntrinsicEconomicValue || hasTownSupport || isFoodTile || (!economyWeak && !foodCoverageLow && !territorySummary.underThreat))) {");
    expect(availabilityBody).toContain("islandSettlementAvailable = true;");
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
