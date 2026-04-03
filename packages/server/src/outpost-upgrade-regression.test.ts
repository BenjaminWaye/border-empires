import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("fort and siege outpost upgrade regression guard", () => {
  it("allows upgrading wooden forts and light outposts into their advanced versions", () => {
    const source = readFileSync(resolve(here, "./main.ts"), "utf8");

    expect(source).toContain("const upgradingWoodenFort =");
    expect(source).toContain('existingEconomic.type === "WOODEN_FORT"');
    expect(source).toContain("if (upgradingWoodenFort) economicStructuresByTile.delete(tk);");
    expect(source).toContain("const upgradingLightOutpost =");
    expect(source).toContain('existingEconomic.type === "LIGHT_OUTPOST"');
    expect(source).toContain("if (upgradingLightOutpost) economicStructuresByTile.delete(tk);");
  });
});
