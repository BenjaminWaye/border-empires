import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const serverMainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./main.ts"), "utf8"),
    readFileSync(resolve(here, "./server-game-constants.ts"), "utf8"),
    readFileSync(resolve(here, "./server-shared-types.ts"), "utf8"),
    readFileSync(resolve(here, "./server-worldgen-towns.ts"), "utf8"),
    readFileSync(resolve(here, "./server-town-support.ts"), "utf8")
  ].join("\n");
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

describe("pre-town settlement regression guard", () => {
  it("keeps settlement-only low population while real world towns seed at the old band", () => {
    const source = serverMainSource();
    expect(source).toContain("const POPULATION_MIN = 3_000;");
    expect(source).toContain("const POPULATION_START_SPREAD = 2_000;");
    expect(source).toContain("const WORLD_TOWN_POPULATION_MIN = 15_000;");
    expect(source).toContain("const WORLD_TOWN_POPULATION_START_SPREAD = 10_000;");
    expect(source).toContain("const initialTownPopulationAt = (x: number, y: number, seed: number): number =>");
  });

  it("keeps a settlement tier before town", () => {
    const body = functionBody(serverMainSource(), "townPopulationTier");
    expect(body).toContain('if (population >= POPULATION_TOWN_MIN) return "TOWN";');
    expect(body).toContain('return "SETTLEMENT";');
  });

  it("treats settlements as a pre-town stage with no support, no upkeep, and starter economy values", () => {
    const source = serverMainSource();
    expect(source).toContain('SETTLEMENT: { cap: 150, regenPerMinute: 10 }');
    expect(source).toContain('const SETTLEMENT_BASE_GOLD_PER_MIN = 1;');
    expect(source).toContain("isSettlement?: boolean;");
    expect(source).toContain('if (town && townPopulationTierForTown(town) === "SETTLEMENT") return { supportCurrent: 0, supportMax: 0 };');
    expect(source).toContain('if (tier === "SETTLEMENT") return 0;');
    expect(source).toContain('if (populationTier === "SETTLEMENT") return SETTLEMENT_BASE_GOLD_PER_MIN;');
  });

  it("repairs legacy low-pop towns on hydrate instead of treating every town as a settlement", () => {
    const source = serverMainSource();
    expect(source).toContain("const normalizeLegacySettlementTowns = (): void => {");
    expect(source).toContain("if (owner && owner.capitalTileKey === town.tileKey) {");
    expect(source).toContain("town.isSettlement = true;");
    expect(source).toContain("town.population = initialTownPopulationAt(x, y, activeSeason.worldSeed);");
  });
});
