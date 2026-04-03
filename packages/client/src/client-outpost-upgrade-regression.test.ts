import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("starter fort and outpost regression guard", () => {
  it("keeps wooden fort and light outpost available from the start and upgrades into the advanced versions", () => {
    const source = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(source).toContain('label: "Build Wooden Fort"');
    expect(source).toContain('label: hasWoodenFort ? "Upgrade to Fort" : "Build Fort"');
    expect(source).toContain('label: hasLightOutpost ? "Upgrade to Siege Outpost" : "Build Siege Outpost"');
    expect(source).toContain('const canBuildStarterWoodenFort =');
    expect(source).toContain('const canBuildAdvancedFort =');
    expect(source).toContain('const canBuildStarterLightOutpost =');
    expect(source).toContain('const canBuildAdvancedSiegeOutpost =');
    expect(source).toContain('if (canBuildAdvancedFort) {');
    expect(source).toContain('} else if (canBuildStarterWoodenFort) {');
    expect(source).toContain('if (canBuildAdvancedSiegeOutpost) {');
    expect(source).toContain('} else if (canBuildStarterLightOutpost) {');
  });
});
