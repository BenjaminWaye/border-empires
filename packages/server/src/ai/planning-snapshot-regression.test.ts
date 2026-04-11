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
    expect(executeBody).toContain("const cachedFrontierPlanningSummary = (): AiFrontierPlanningSummary =>");
    expect(executeBody).toContain("queueAiActionWithIntentLatch(actor, { type: \"EXPAND\"");
    expect(executeBody).toContain("queueAiActionWithIntentLatch(actor, { type: \"ATTACK\"");
    expect(executeBody).toContain("queueAiActionWithIntentLatch(actor, { type: \"SETTLE\"");
    expect(executeBody).toContain("queueAiActionWithIntentLatch(actor, { type: \"BUILD_SIEGE_OUTPOST\"");
    expect(executeBody).toContain("frontierPlanningSummaryForPlayer(actor, territorySummary ?? collectAiTerritorySummary(actor))");
    expect(executeBody).toContain("cachedFrontierPlanningSummary().bestIslandExpand");
    expect(executeBody).toContain("cachedFrontierPlanningSummary().bestEconomicExpand");
    expect(executeBody).toContain("cachedFrontierPlanningSummary().bestAnyNeutralExpand");
    expect(executeBody).toContain("const cachedNeutralExpandCandidate = (): { from: Tile; to: Tile } | undefined =>");
    expect(executeBody).toContain("aiFrontierCandidateFromExecuteCandidate(");
    expect(executeBody).not.toContain("cachedFrontierPlanningSummary().bestScaffoldExpand");
  });

  it("does not fall back from scout execute into heavy any-neutral frontier scans", () => {
    const body = functionBody(serverMainSource(), "executeAiGoapAction");
    const scoutBranchStart = body.indexOf('if (actionKey === "claim_scout_border_tile")');
    expect(scoutBranchStart).toBeGreaterThanOrEqual(0);
    const scoutBranch = body.slice(scoutBranchStart, body.indexOf('if (actionKey === "claim_scaffold_border_tile")', scoutBranchStart));
    expect(scoutBranch).toContain("candidates?.scoutExpand ??");
    expect(scoutBranch).toContain("bestAiScoutExpand(actor, territorySummary)");
    expect(scoutBranch).not.toContain("cachedFrontierPlanningSummary().bestScoutExpand");
    expect(scoutBranch).not.toContain("bestAiAnyNeutralExpand(");
  });

  it("does not fall back from scaffold execute into heavy frontier planning summary scans", () => {
    const body = functionBody(serverMainSource(), "executeAiGoapAction");
    const scaffoldBranchStart = body.indexOf('if (actionKey === "claim_scaffold_border_tile")');
    expect(scaffoldBranchStart).toBeGreaterThanOrEqual(0);
    const scaffoldBranch = body.slice(scaffoldBranchStart, body.indexOf('if (actionKey === "attack_barbarian_border_tile")', scaffoldBranchStart));
    expect(scaffoldBranch).toContain("candidates?.scaffoldExpand ??");
    expect(scaffoldBranch).toContain("bestAiScaffoldExpand(actor, victoryPath, territorySummary)");
    expect(scaffoldBranch).not.toContain("cachedFrontierPlanningSummary().bestScaffoldExpand");
  });

  it("keeps execute-time frontier selectors off the heavy frontier planning summary path", () => {
    const source = serverMainSource();
    const selectorNames = [
      "bestAiScoutExpand",
      "bestAiScaffoldExpand",
      "bestAiEconomicExpand",
      "bestAiIslandExpand",
      "bestAiAnyNeutralExpand"
    ] as const;

    for (const selectorName of selectorNames) {
      const body = functionBody(source, selectorName);
      expect(body).not.toContain("frontierPlanningSummaryForPlayer(");
    }
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
    expect(scoreScoutBody).toContain("cachedScoutAdjacencyMetrics(actor, to, territorySummary)");
    expect(openingScoutBody).toContain("cachedScoutAdjacencyMetrics(actor, to, territorySummary)");
    expect(revealBody).toContain("const profileKey = `${territorySummary.foodPressure > 0 ? 1 : 0}:${economyWeak ? 1 : 0}:${tk}`;");
  });

  it("keeps victory-path scoring on cheap cached territory signals", () => {
    const source = serverMainSource();
    expect(source).toContain("const townOpportunityScore = territorySummary.neutralTownExpandCount * 5 + territorySummary.hostileTownAttackCount * 6;");
    expect(source).toContain("const economicOpportunityScore = territorySummary.neutralEconomicExpandCount * 4 + territorySummary.hostileEconomicAttackCount * 3;");
    expect(source).toContain("const expansionOpportunityScore = territorySummary.neutralLandExpandCount + Math.min(territorySummary.frontierTileCount, 24);");
    expect(source).toContain("const populationCounts = aiVictoryPathPopulationCounts();");
    expect(source).toContain("const contenderBonus = aiVictoryPathContenderBonus(entry.id, analysis, townsTarget, settledTilesTarget);");
    expect(source).toContain("Math.max(0, crowdingPenalty - contenderBonus)");
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
    expect(chooseStrategicBody).toContain("shouldAiStayInIslandFootprint({");
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

  it("tracks contender-aware siege pressure in planning snapshot and runtime debug only", () => {
    const source = serverMainSource();
    const snapshotBody = functionBody(source, "buildAiPlanningSnapshot");
    const staticBody = functionBody(source, "buildAiPlanningStaticCache");

    expect(staticBody).toContain("let siegeOutpostAvailable = false;");
    expect(staticBody).toContain("canBuildSiegeOutpostAt(actor, tile.x, tile.y).ok");
    expect(snapshotBody).toContain("siegeOutpostAvailable: planningStatic.siegeOutpostAvailable");
    expect(snapshotBody).toContain("canBuildSiegeOutpost:");
    expect(snapshotBody).toContain("victoryPathContender: primaryVictoryPath ? isAiVictoryPathContender(primaryVictoryPath, analysis, townsTarget, settledTilesTarget) : false");
    expect(source).toContain("const runtimeVictoryOverview = (): Record<string, unknown> =>");
    expect(source).toContain("runtimeVictoryOverview");
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
