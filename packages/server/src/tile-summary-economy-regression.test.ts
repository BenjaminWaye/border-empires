import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
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

const declarationSnippet = (source: string, functionName: string): string => {
  const start = source.indexOf(`const ${functionName} =`);
  if (start === -1) throw new Error(`Could not find declaration for ${functionName}`);
  const end = source.indexOf(";", start);
  if (end === -1) throw new Error(`Could not find declaration terminator for ${functionName}`);
  return source.slice(start, end + 1);
};

describe("tile summary economy regression guard", () => {
  it("does not zero out town economy fields in the thin town summary", () => {
    const body = declarationSnippet(serverMainSource(), "thinTownSummaryForTile");
    const forbiddenSnippets = [
      "supportCurrent: 0",
      "supportMax: 0",
      "goldPerMinute: 0",
      "cap: 0",
      "populationGrowthPerMinute: 0",
      "connectedTownBonus: 0",
      "foodUpkeepPerMinute: 0",
      "growthModifiers: []"
    ];

    for (const forbidden of forbiddenSnippets) {
      expect(body).not.toContain(forbidden);
    }
  });

  it("keeps tile yield summary data on thin chunk tiles", () => {
    const body = functionBody(serverMainSource(), "playerTileSummary");
    expect(body).toContain("applyTileYieldSummary(");
  });
});
