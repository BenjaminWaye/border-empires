import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const mainSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./main.ts"), "utf8"),
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

describe("fort combat wiring regression guard", () => {
  it("applies the fortified-target penalty unless the attack originates from an outpost", () => {
    const source = mainSource();
    const body = functionBody(source, "attackMultiplierForTarget");

    expect(source).toContain(
      "const attackMultiplierForTarget = (attackerId: string, target: Tile, originTileKey?: TileKey): number => {"
    );
    expect(body).toContain("const fortifiedTarget = target.ownerId ? targetHasActiveFortification(target.ownerId, targetKey) : false;");
    expect(body).toContain("deps.fortifiedTargetAttackMultiplier({");
    expect(body).toContain("originHasOutpost: originTileKey ? originHasActiveOutpost(attackerId, originTileKey) : false");
    expect(source).toContain("attackMultiplierForTarget(actor.id, to, fk)");
  });
});
