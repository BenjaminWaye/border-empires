import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const serverSource = (): string => {
  const here = dirname(fileURLToPath(import.meta.url));
  return [
    readFileSync(resolve(here, "./main.ts"), "utf8"),
    readFileSync(resolve(here, "./server-town-support.ts"), "utf8"),
    readFileSync(resolve(here, "./server-combat-support-runtime.ts"), "utf8"),
    readFileSync(resolve(here, "./server-ownership-runtime.ts"), "utf8"),
    readFileSync(resolve(here, "./sim/chunk-state.ts"), "utf8")
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

describe("captured structure preservation regression guard", () => {
  it("transfers captured forts and buildings into the town capture recovery window instead of deleting them", () => {
    const source = serverSource();
    const ownershipBody = functionBody(source, "updateOwnership");
    expect(source).toContain("export const TOWN_CAPTURE_SHOCK_MS = 10 * 60 * 1000;");
    expect(ownershipBody).toContain("fort.ownerId = newOwner;");
    expect(ownershipBody).toContain("fort.disabledUntil = deps.now() + deps.TOWN_CAPTURE_SHOCK_MS;");
    expect(ownershipBody).toContain("economic.disabledUntil = deps.now() + deps.TOWN_CAPTURE_SHOCK_MS;");
    expect(ownershipBody).toContain("economic.nextUpkeepAt = economic.disabledUntil;");
    expect(ownershipBody).not.toContain('} else if (isLightCombatStructureType(economic.type)) {');
  });

  it("only applies fort modifiers after capture recovery expires", () => {
    const source = serverSource();
    const fortHelperBody = functionBody(source, "fortOperationalForOwner");
    const defenseBody = functionBody(source, "fortDefenseMultAt");
    expect(fortHelperBody).toContain("return fortRecoveryReadyAt(fort) <= deps.now();");
    expect(defenseBody).toContain("if (fortOperationalForOwner(defenderId, tileKey)) {");
    expect(source).toContain("if (fort.disabledUntil !== undefined) fortView.disabledUntil = fort.disabledUntil;");
  });
});
