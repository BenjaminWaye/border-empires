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
  const open = source.indexOf("{", start);
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
    expect(body).toContain("barbarianAttackAvailable = true");
    expect(body).toContain("const pressureAttackProfile = estimateAiPressureAttackProfile(actor, territorySummary);");
    expect(body).toContain("territorySummary.borderSettledTileKeys.has(tk)");
    expect(body).toContain("!fortsByTile.has(tk)");
  });

  it("uses cached strategic posture and lightweight shard-or-truce handling", () => {
    const chooseStrategicBody = functionBody(serverMainSource(), "chooseAiStrategicState");
    const truceBody = functionBody(serverMainSource(), "maybeHandleAiShardOrTruce");

    expect(chooseStrategicBody).toContain("AI_STRATEGIC_STATE_TTL_MS");
    expect(chooseStrategicBody).toContain("\"TRUCE\"");
    expect(chooseStrategicBody).toContain("\"ISLAND_FOOTPRINT\"");
    expect(chooseStrategicBody).toContain("\"SHARD_RUSH\"");
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

    expect(staticBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(frontierSummaryBody).toContain("tileHasPendingSettlement(tileKey)");
    expect(settlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(islandSettlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(townSupportSettlementBody).toContain("frontierSettlementSummaryForPlayer(");
    expect(evaluationBody).toContain("ownershipStateByTile.get(tk)");
    expect(fortBody).toContain("fortsByTile.has(tk)");
    expect(fortBody).toContain("isBorderTile(tile.x, tile.y, actor.id)");
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
});
