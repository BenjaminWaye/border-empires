import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "../main.ts"), "utf8"),
    readFileSync(resolve(here, "../server-runtime-config.ts"), "utf8")
  ].join("\n");
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

describe("AI budget regression guard", () => {
  it("defines a soft AI tick budget and records budget breaches without throttling turns", () => {
    const source = serverMainSource();
    expect(source).toContain("const AI_TICK_BUDGET_MS = Math.max(250, Number(process.env.AI_TICK_BUDGET_MS ?? 1_000));");
    expect(source).toContain("const AI_FRONTIER_SELECTOR_BUDGET_MS = Math.max(");
    expect(source).toContain("const recentAiBudgetBreachPerf = perfRing<");
    expect(source).toContain('appRef?.log.warn(sample, "ai budget breach");');
  });

  it("records budget breaches from runAiTurn slow paths", () => {
    const body = functionBody(serverMainSource(), "runAiTurn");
    expect(body).toContain("recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: shardOrTruceResult });");
    expect(body).toContain("recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: decision.reason });");
    expect(body).toContain("recordAiBudgetBreach(actor, totalElapsedMs, phaseTimings, { reason: decision.reason, actionKey: decision.actionKey });");
  });

  it("exposes AI budget diagnostics in runtime debug and dashboard html", () => {
    const source = serverMainSource();
    const dashboardBody = functionBody(source, "runtimeDashboardPayload");
    expect(dashboardBody).toContain("aiBudget: {");
    expect(dashboardBody).toContain("budgetMs: AI_TICK_BUDGET_MS");
    expect(dashboardBody).toContain("const recentAiBudgetBreaches = recentAiBudgetBreachPerf.values();");
    expect(dashboardBody).toContain("recent: recentAiBudgetBreaches");
    expect(source).toContain('metricRow("AI budget breaches"');
    expect(source).toContain('renderHotspotBlock("AI budget breaches"');
  });

  it("keeps opening scout planning in the frontier summary while execute-time selection stays explicit", () => {
    const source = serverMainSource();
    const planningBody = functionBody(source, "frontierPlanningSummaryForPlayer");
    const turnBody = functionBody(source, "runAiTurn");
    expect(planningBody).toContain("let bestOpeningScoutExpand:");
    expect(planningBody).toContain("openingScoutAvailable = true;");
    expect(planningBody).toContain("bestOpeningScoutExpand = { score: openingScoutScore, from, to };");
    expect(planningBody).toContain("bestOpeningScoutExpand: { from: bestOpeningScoutExpand.from, to: bestOpeningScoutExpand.to }");
    expect(turnBody).toContain("const opening = bestAiOpeningScoutExpand(actor, territorySummary);");
  });

  it("hard-caps generic frontier action scans so neutral and attack execute paths cannot monopolize the process", () => {
    const source = serverMainSource();
    const start = source.indexOf("const bestAiFrontierAction =");
    const end = source.indexOf("const bestAiOpeningScoutExpand =", start);
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const body = source.slice(start, end);
    expect(body).toContain("const startedAt = now();");
    expect(body).toContain("let scannedCandidates = 0;");
    expect(body).toContain("if ((scannedCandidates & 7) === 0 && now() - startedAt >= AI_FRONTIER_SELECTOR_BUDGET_MS)");
    expect(body).toContain('"ai frontier action selector budget hit"');
  });

  it("keeps planning static lightweight and lets execute use budgeted selectors", () => {
    const source = serverMainSource();
    const planningBody = functionBody(source, "buildAiPlanningStaticCache");
    const executeBody = functionBody(source, "executeAiGoapAction");
    const scoutBody = functionBody(source, "bestAiScoutExpand");
    expect(planningBody).toContain("const settlementAvailability = estimateAiSettlementAvailabilityProfile(actor, territorySummary, focusIslandId, economyWeak, foodCoverageLow);");
    expect(planningBody).toContain("const frontierAvailability = estimateAiFrontierAvailabilityProfile(actor, territorySummary);");
    expect(planningBody).not.toContain("frontierPlanningSummaryForPlayer(");
    expect(planningBody).not.toContain("frontierSettlementSummaryForPlayer(");
    expect(executeBody).toContain("const candidate = bestAiScoutExpand(actor, territorySummary);");
    expect(executeBody).toContain("const frontierSummary = frontierPlanningSummaryForPlayer(actor, territorySummary);");
    expect(executeBody).toContain("frontierActionFromSummaryPair(frontierSummary.bestAnyNeutralExpand)");
    expect(executeBody).toContain("frontierActionFromSummaryPair(frontierSummary.bestScaffoldExpand)");
    expect(executeBody).toContain("bestAiEnemyPressureAttack(actor, victoryPath, territorySummary)");
    expect(executeBody).toContain("const candidate = bestAiEconomicStructure(actor, territorySummary);");
    expect(scoutBody).not.toContain("frontierPlanningSummaryForPlayer(");
    expect(scoutBody).toContain('"ai scout selector budget hit"');
    expect(scoutBody).toContain("const shortlist:");
    expect(scoutBody).toContain("AI_SCOUT_SHORTLIST_SIZE");
    expect(planningBody).not.toContain("countAiScoutRevealTiles(");
  });

  it("keys settlement candidate assumptions by tile index instead of allocating singleton sets", () => {
    const body = functionBody(serverMainSource(), "evaluateAiSettlementCandidate");
    expect(body).toContain('const cacheKey = `${tkIndex}|${victoryPath ?? "none"}|${assumedFrontierTileIndex ?? -1}`;');
    expect(body).toContain("const assumedOwned = assumedFrontierTileIndex === tkIndex;");
    expect(body).toContain("if (assumedFrontierTileIndex === tileIndex(neighbor.x, neighbor.y)) {");
  });

  it("refreshes planning static cache when actor budget or pending settlement state changes", () => {
    const source = serverMainSource();
    const cachedBody = functionBody(source, "cachedAiPlanningStaticForPlayer");
    expect(source).toContain("const aiPlanningStaticProfileKey = (");
    expect(cachedBody).toContain("const profileKey = aiPlanningStaticProfileKey(actor, territorySummary, victoryPath);");
    expect(cachedBody).toContain("const pendingSettlementCount = pendingSettlementCountForPlayer(actor.id);");
    expect(cachedBody).toContain("cached.profileKey === profileKey");
    expect(cachedBody).toContain("cached.pendingSettlementCount === pendingSettlementCount");
  });
});
