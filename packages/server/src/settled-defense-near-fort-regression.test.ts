import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SETTLED_DEFENSE_NEAR_FORT_RADIUS } from "@border-empires/shared";

const serverSource = (): string => {
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
  for (let i = open; i < source.length; i += 1) {
    const char = source[i];
    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error(`Could not find closing brace for ${functionName}`);
};

describe("settled defense near fort regression guard", () => {
  it("applies the domain multiplier only when a settled tile is covered by an active fort", () => {
    const source = serverSource();
    const recomputeBody = functionBody(source, "recomputePlayerEffectsForPlayer");
    const defenseBody = functionBody(source, "settledDefenseMultiplierForTarget");
    const coverageBody = functionBody(source, "settledDefenseNearFortApplies");

    expect(recomputeBody).toContain("next.settledDefenseNearFortMult *= effects.settledDefenseNearFortMult;");
    expect(defenseBody).toContain("effects.settledDefenseNearFortMult > 1");
    expect(defenseBody).toContain("settledDefenseNearFortApplies(defenderId, target)");
    expect(coverageBody).toContain("wrappedChebyshevDistance(x, y, target.x, target.y) <= SETTLED_DEFENSE_NEAR_FORT_RADIUS");
    expect(coverageBody).toContain('structure.type !== "WOODEN_FORT"');
  });

  it("uses the shared 1-tile local defense radius", () => {
    expect(SETTLED_DEFENSE_NEAR_FORT_RADIUS).toBe(1);
  });
});
