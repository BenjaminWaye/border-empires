import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./main.ts"), "utf8"),
    readFileSync(resolve(here, "./server-town-support.ts"), "utf8"),
    readFileSync(resolve(here, "./server-combat-support-runtime.ts"), "utf8")
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

describe("capture payout regression guard", () => {
  it("bases settled capture share on settled tiles, not total territory", () => {
    const body = serverMainSource();
    expect(body).toContain("settledTileCountForPlayer(defender)");
    expect(body).not.toContain("Math.max(1, defender.territoryTiles.size)");
  });

  it("transfers stored yield to the attacker on settled capture", () => {
    const body = functionBody(serverMainSource(), "seizeStoredYieldOnCapture");
    expect(body).toContain("attacker.points += gold");
    expect(body).toContain("stock[resource] += amount");
    expect(body).toContain("deps.pruneEmptyTileYield(tileKey, yieldBuffer)");
  });

  it("only applies town capture population loss on the first capture inside the recent-capture window", () => {
    const source = serverMainSource();
    const helperBody = functionBody(source, "applyTownCapturePopulationLoss");
    const ownershipBody = functionBody(source, "updateOwnership");
    expect(source).toContain("const TOWN_CAPTURE_POPULATION_LOSS_MULT = 0.95;");
    expect(helperBody).toContain('if ((townCaptureShockUntilByTile.get(town.tileKey) ?? 0) > now()) return;');
    expect(helperBody).toContain("town.population = Math.max(1, town.population * TOWN_CAPTURE_POPULATION_LOSS_MULT);");
    expect(ownershipBody).toContain("applyTownCapturePopulationLoss(capturedTown);");
    expect(ownershipBody).toContain("applyTownCaptureShock(k);");
  });
});
