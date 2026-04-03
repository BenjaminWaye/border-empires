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
});
