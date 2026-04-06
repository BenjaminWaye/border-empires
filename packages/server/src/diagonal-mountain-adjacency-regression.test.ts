import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return readFileSync(resolve(here, "./main.ts"), "utf8");
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

describe("diagonal mountain adjacency regression guard", () => {
  it("keeps direct frontier adjacency on Chebyshev distance instead of cardinal-only movement", () => {
    const body = functionBody(serverMainSource(), "isAdjacentTile");
    expect(body).toContain("return dx <= 1 && dy <= 1 && (dx !== 0 || dy !== 0);");
  });

  it("keeps AI frontier candidate generation on all adjacent neighbors, including diagonals", () => {
    const body = functionBody(serverMainSource(), "aiFrontierActionCandidates");
    expect(body).toContain("for (const neighbor of adjacentNeighborCores(from.x, from.y))");
  });

  it("does not add a mountain corner-block check to queued frontier actions", () => {
    const body = functionBody(serverMainSource(), "tryQueueBasicFrontierAction");
    expect(body).toContain("let adjacent = isAdjacentTile(from.x, from.y, to.x, to.y);");
    expect(body).toContain('if (to.terrain !== "LAND") return { ok: false, code: "BARRIER", message: "target is barrier" };');
    expect(body).not.toContain("terrainAtRuntime");
    expect(body).not.toContain("MOUNTAIN");
  });
});
