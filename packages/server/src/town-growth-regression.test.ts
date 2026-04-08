import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readServerSource = (relativePath: string): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, relativePath), "utf8");
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

describe("town growth regression guard", () => {
  it("only advances town population on real elapsed minute ticks", () => {
    const body = functionBody(readServerSource("./server-town-economy-runtime.ts"), "updateTownPopulationForPlayer");
    expect(body).not.toContain("Math.max(1, Math.floor");
    expect(body).toContain("if (elapsedMinutes <= 0) continue;");
    expect(body).toContain("town.lastGrowthTickAt += elapsedMinutes * POPULATION_GROWTH_TICK_MS;");
  });

  it("keeps the economy tick running even when no players are currently online", () => {
    const source = readServerSource("./main.ts");
    const economyTickAnchor = "const populationTouched = updateTownPopulationForPlayer(p);";
    const anchorIndex = source.indexOf(economyTickAnchor);
    expect(anchorIndex).toBeGreaterThan(-1);
    const windowStart = Math.max(0, anchorIndex - 400);
    const prelude = source.slice(windowStart, anchorIndex);
    expect(prelude).not.toContain("if (!hasOnlinePlayers()) return;");
  });
});
