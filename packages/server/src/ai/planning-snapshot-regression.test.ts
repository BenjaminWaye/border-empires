import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "../main.ts"), "utf8");
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

  it("derives economic build availability from the exact runtime selector in the cached planning layer", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    expect(body).toContain("bestAiEconomicStructure(actor, territorySummary)");
    expect(body).not.toContain("structureCandidateTiles.some");
  });

  it("derives barbarian attack availability from the exact runtime selector in the cached planning layer", () => {
    const body = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    expect(body).toContain("const barbarianAttackCandidate = bestAiFrontierAction(");
    expect(body).toContain("barbarianAttackAvailable: Boolean(barbarianAttackCandidate)");
  });

  it("uses cached strategic posture and lightweight shard-or-truce handling", () => {
    const chooseStrategicBody = functionBody(serverMainSource(), "chooseAiStrategicState");
    const truceBody = functionBody(serverMainSource(), "maybeHandleAiShardOrTruce");

    expect(chooseStrategicBody).toContain("AI_STRATEGIC_STATE_TTL_MS");
    expect(chooseStrategicBody).toContain("\"TRUCE\"");
    expect(chooseStrategicBody).toContain("\"ISLAND_FOOTPRINT\"");
    expect(truceBody).toContain("bestAiCollectShardTile");
    expect(truceBody).toContain("TRUCE_REQUEST");
    expect(truceBody).toContain("TRUCE_ACCEPT");
  });

  it("does not advertise or select settlement targets that are already settling", () => {
    const staticBody = functionBody(serverMainSource(), "buildAiPlanningStaticCache");
    const settlementBody = functionBody(serverMainSource(), "bestAiSettlementTile");
    const evaluationBody = functionBody(serverMainSource(), "evaluateAiSettlementCandidate");
    const fortBody = functionBody(serverMainSource(), "bestAiFortTile");

    expect(staticBody).toContain("tileHasPendingSettlement(tileKey)");
    expect(staticBody).toContain("bestAiSettlementTile(actor, undefined, territorySummary)");
    expect(staticBody).toContain("bestAiTownSupportSettlementTile(actor, undefined, territorySummary)");
    expect(settlementBody).toContain("tileHasPendingSettlement(tileKey)");
    expect(evaluationBody).toContain("ownershipStateByTile.get(tk)");
    expect(fortBody).toContain("fortsByTile.has(tk)");
    expect(fortBody).toContain("isBorderTile(tile.x, tile.y, actor.id)");
  });

  it("keeps island-victory focus targeted and avoids treating fully fed empires as food emergencies", () => {
    const source = serverMainSource();
    const turnAnalysisBody = functionBody(serverMainSource(), "buildAiTurnAnalysis");

    expect(source).toContain("const bestAiIslandFocusTargetId =");
    expect(source).toContain("const focusIslandId = bestAiIslandFocusTargetId(actor, territorySummary);");
    expect(source).toContain("const foodCoverageLow = controlledTowns > 0 && currentFoodCoverageForPlayer(actor.id) < 1;");
    expect(turnAnalysisBody).toContain("foodCoverage < 1");
  });
});
