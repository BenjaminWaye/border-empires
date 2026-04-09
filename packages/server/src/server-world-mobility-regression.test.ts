import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverWorldMobilitySource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./server-world-mobility.ts"), "utf8");
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

describe("server world mobility regression guard", () => {
  it("filters missing adjacent barbarian target tiles before scoring defense", () => {
    const body = functionBody(serverWorldMobilitySource(), "chooseBarbarianTarget");
    expect(body).toContain(".filter((tile): tile is Tile => Boolean(tile))");
  });

  it("treats missing barbarian defense tiles as zero score instead of crashing", () => {
    const body = functionBody(serverWorldMobilitySource(), "barbarianDefenseScore");
    expect(body).toContain("if (!tile) return 0;");
  });
});
