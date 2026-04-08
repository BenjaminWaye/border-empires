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

  it("skips full AI planning while pending work or a latched intent is still active", () => {
    const body = functionBody(serverMainSource(), "runAiTurn");
    expect(body).toContain("const latchedIntent = probeAiLatchedIntent(aiIntentLatchState");
    expect(body).toContain('setAiTurnDebug(actor, "waiting_on_pending_settlement_resolution"');
    expect(body).toContain('setAiTurnDebug(actor, "waiting_on_latched_intent"');
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

  it("hard-caps scout frontier selector scans so one AI execute path cannot monopolize the process", () => {
    const body = functionBody(serverMainSource(), "bestAiScoutExpand");
    expect(body).toContain("const startedAt = now();");
    expect(body).toContain("let scannedCandidates = 0;");
    expect(body).toContain("if (scoutRevealCount <= 0 && adjacency.coastlineDiscoveryValue <= 0)");
    expect(body).toContain("if ((scannedCandidates & 3) === 0 && now() - startedAt >= AI_FRONTIER_SELECTOR_BUDGET_MS)");
    expect(body).toContain("if ((scannedCandidates & 31) === 0 && now() - startedAt >= AI_FRONTIER_SELECTOR_BUDGET_MS)");
    expect(body).toContain('"ai frontier selector budget hit"');
  });

  it("reuses cached scout adjacency in frontier planning availability instead of rescanning neighbors", () => {
    const body = functionBody(serverMainSource(), "estimateAiFrontierAvailabilityProfile");
    expect(body).toContain("const adjacency = cachedScoutAdjacencyMetrics(actor, to, territorySummary);");
    expect(body).toContain("countAiScoutRevealTiles(to, territorySummary.visibility, territorySummary) > 0 || adjacency.coastlineDiscoveryValue > 0");
  });
});
